import hashlib
import hmac
import json
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import jwt
import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.commerce import (
    apply_captured_payment,
    lock_order,
    reconcile_expired_orders,
    reserve_order,
)
from app.config import Settings, get_settings
from app.models import (
    Order,
    OrderStatus,
    PaymentStatus,
    PaymentTransaction,
    ProductVariant,
    now,
)
from app.schemas import CreateOrderInput
from app.security import order_token


def create(environment, payload, key=None):
    response = environment["client"].post(
        "/api/orders/create",
        json=payload,
        headers={"Idempotency-Key": key or str(uuid.uuid4())},
    )
    assert response.status_code == 201, response.text
    return response.json()


def payment(order, **changes):
    return {
        "id": "pay_abc123",
        "order_id": order["razorpay_order_id"],
        "amount": order["total_paise"],
        "currency": "INR",
        "status": "captured",
        **changes,
    }


def webhook(
    environment,
    order,
    *,
    kind="payment.captured",
    event_id="evt_1",
    changes=None,
    signature=None,
    raw=None,
):
    if raw is None:
        raw = json.dumps(
            {
                "event": kind,
                "payload": {"payment": {"entity": payment(order, **(changes or {}))}},
            },
            separators=(",", ":"),
        ).encode()
    signature = (
        signature or hmac.new(b"test-webhook-secret", raw, hashlib.sha256).hexdigest()
    )
    return environment["client"].post(
        "/api/payments/verify-webhook",
        content=raw,
        headers={
            "X-Razorpay-Signature": signature,
            "X-Razorpay-Event-Id": event_id,
            "Content-Type": "application/json",
        },
    )


def razorpay_order(environment, order):
    with environment["factory"]() as db:
        db.get(Order, order["id"]).payment_provider = "razorpay"
        db.commit()


def test_product_filters_and_server_totals(environment, payload):
    client = environment["client"]
    products = client.get("/api/products?category=whole-kernels&grade=W-320").json()
    assert len(products) == 1
    assert client.get("/api/products/unknown").status_code == 404
    quoted = client.post(
        "/api/checkout/quote",
        json={"items": payload["items"], "pincode": "600001", "coupon": "farm10"},
    )
    assert quoted.status_code == 200
    assert quoted.json()["subtotal_paise"] == 65800
    assert quoted.json()["discount_paise"] == 6580
    assert quoted.json()["total_paise"] == 66120
    payload["total_paise"] = 1
    assert (
        client.post(
            "/api/orders/create",
            json=payload,
            headers={"Idempotency-Key": str(uuid.uuid4())},
        ).status_code
        == 422
    )


def test_idempotency_reuses_reservation_and_gateway_order(environment, payload):
    key = str(uuid.uuid4())
    first = create(environment, payload, key)
    second = create(environment, payload, key)
    assert first["id"] == second["id"]
    assert first["order_token"] == second["order_token"]
    assert environment["gateway"].calls == 1
    with environment["factory"]() as db:
        assert (
            db.get(ProductVariant, payload["items"][0]["variant_id"]).reserved_stock
            == 2
        )
        assert db.scalar(select(func.count(Order.id))) == 1
    payload["items"][0]["quantity"] = 3
    response = environment["client"].post(
        "/api/orders/create", json=payload, headers={"Idempotency-Key": key}
    )
    assert response.status_code == 409


def test_out_of_stock_rolls_back_entire_order(environment, payload):
    with environment["factory"]() as db:
        db.get(ProductVariant, payload["items"][0]["variant_id"]).stock_on_hand = 1
        db.commit()
    response = environment["client"].post(
        "/api/orders/create",
        json=payload,
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )
    assert response.status_code == 409
    with environment["factory"]() as db:
        assert db.scalar(select(func.count(Order.id))) == 0
        assert (
            db.get(ProductVariant, payload["items"][0]["variant_id"]).reserved_stock
            == 0
        )


def test_invalid_coupon_and_nonserviceable_pin_rejected(environment, payload):
    client = environment["client"]
    for coupon, pincode in [("NOTREAL", "600001"), (None, "999999")]:
        response = client.post(
            "/api/checkout/quote",
            json={"items": payload["items"], "pincode": pincode, "coupon": coupon},
        )
        assert response.status_code == 422
    payload["items"] *= 11
    assert (
        client.post(
            "/api/checkout/quote", json={"items": payload["items"], "pincode": "600001"}
        ).status_code
        == 422
    )


def test_webhook_signature_replay_and_out_of_order_events(environment, payload):
    order = create(environment, payload)
    razorpay_order(environment, order)
    assert webhook(environment, order, signature="a" * 64).status_code == 401
    assert webhook(environment, order).status_code == 200
    assert webhook(environment, order).json()["duplicate"] is True
    assert (
        webhook(environment, order, event_id="evt_2", kind="order.paid").status_code
        == 200
    )
    assert (
        webhook(
            environment,
            order,
            kind="payment.authorized",
            event_id="evt_3",
            changes={"status": "authorized"},
        ).status_code
        == 200
    )
    with environment["factory"]() as db:
        variant = db.get(ProductVariant, payload["items"][0]["variant_id"])
        assert (variant.stock_on_hand, variant.reserved_stock) == (38, 0)
        assert db.get(Order, order["id"]).payment_status == PaymentStatus.PAID
        assert db.scalar(select(func.count(PaymentTransaction.id))) == 1


@pytest.mark.parametrize(
    "changes", [{"amount": 1}, {"currency": "USD"}, {"status": "authorized"}]
)
def test_mismatched_capture_never_marks_paid(environment, payload, changes):
    order = create(environment, payload)
    razorpay_order(environment, order)
    assert webhook(environment, order, changes=changes).status_code == 400
    with environment["factory"]() as db:
        assert db.get(Order, order["id"]).payment_status == PaymentStatus.PENDING


def test_webhook_signs_exact_raw_bytes(environment, payload):
    order = create(environment, payload)
    razorpay_order(environment, order)
    raw = json.dumps(
        {
            "event": "payment.captured",
            "payload": {"payment": {"entity": payment(order)}},
        },
        indent=3,
    ).encode()
    assert webhook(environment, order, raw=raw).status_code == 200
    assert webhook(environment, order, raw=raw + b" ").status_code == 409


def test_client_callback_fetches_actual_payment_status(environment, payload):
    order = create(environment, payload)
    razorpay_order(environment, order)
    signature = hmac.new(
        b"test-key-secret",
        f"{order['razorpay_order_id']}|pay_abc123".encode(),
        hashlib.sha256,
    ).hexdigest()
    body = {
        "order_id": order["id"],
        "razorpay_order_id": order["razorpay_order_id"],
        "razorpay_payment_id": "pay_abc123",
        "razorpay_signature": signature,
    }
    environment["gateway"].fetched_payment = payment(order, status="authorized")
    result = environment["client"].post(
        "/api/payments/verify",
        json=body,
        headers={"X-Order-Token": order["order_token"]},
    )
    assert result.status_code == 200 and result.json()["payment_status"] == "PENDING"
    environment["gateway"].fetched_payment = payment(order)
    result = environment["client"].post(
        "/api/payments/verify",
        json=body,
        headers={"X-Order-Token": order["order_token"]},
    )
    assert result.json()["payment_status"] == "PAID"


def test_tracking_requires_secret_and_excludes_pii(environment, payload):
    order = create(environment, payload)
    path = f"/api/orders/{order['id']}/track"
    assert environment["client"].get(path).status_code == 404
    response = environment["client"].get(
        path, headers={"X-Order-Token": order["order_token"]}
    )
    assert response.status_code == 200
    assert all(
        value not in response.text
        for value in [
            payload["email"],
            payload["address"]["phone"],
            payload["address"]["line1"],
        ]
    )
    assert response.headers["cache-control"] == "no-store"


def test_expiration_reconciles_captured_funds_before_releasing_stock(
    environment, payload
):
    order = create(environment, payload)
    with environment["factory"]() as db:
        db.get(Order, order["id"]).reservation_expires_at = now() - timedelta(minutes=1)
        db.commit()
    environment["gateway"].order_payments = [payment(order)]
    with environment["factory"]() as db:
        reconcile_expired_orders(db, environment["gateway"])
        assert db.get(Order, order["id"]).payment_status == PaymentStatus.PAID
        variant = db.get(ProductVariant, payload["items"][0]["variant_id"])
        assert (variant.stock_on_hand, variant.reserved_stock) == (38, 0)


def test_late_capture_without_stock_goes_to_review(environment, payload):
    order = create(environment, payload)
    razorpay_order(environment, order)
    with environment["factory"]() as db:
        db.get(Order, order["id"]).reservation_expires_at = now() - timedelta(minutes=1)
        db.commit()
        reconcile_expired_orders(db, environment["gateway"])
        assert db.get(Order, order["id"]).payment_status == PaymentStatus.EXPIRED
        db.get(ProductVariant, payload["items"][0]["variant_id"]).stock_on_hand = 0
        db.commit()
    assert webhook(environment, order).status_code == 200
    with environment["factory"]() as db:
        assert db.get(Order, order["id"]).payment_status == PaymentStatus.REVIEW
        assert (
            db.get(ProductVariant, payload["items"][0]["variant_id"]).stock_on_hand == 0
        )
    assert (
        environment["client"]
        .patch(
            f"/api/admin/orders/{order['id']}/status",
            json={"status": "PACKED"},
            headers=environment["admin_headers"],
        )
        .status_code
        == 409
    )


def test_second_capture_does_not_consume_stock_twice(environment, payload):
    order = create(environment, payload)
    razorpay_order(environment, order)
    assert webhook(environment, order).status_code == 200
    assert (
        webhook(
            environment, order, event_id="evt_2", changes={"id": "pay_extra123"}
        ).status_code
        == 200
    )
    assert (
        webhook(
            environment, order, event_id="evt_3", changes={"id": "pay_extra456"}
        ).status_code
        == 200
    )
    with environment["factory"]() as db:
        assert db.get(Order, order["id"]).payment_status == PaymentStatus.REVIEW
        assert (
            db.get(ProductVariant, payload["items"][0]["variant_id"]).stock_on_hand
            == 38
        )


def test_admin_auth_inventory_conflicts_and_order_progression(environment, payload):
    client, headers = environment["client"], environment["admin_headers"]
    assert client.get("/api/admin/inventory").status_code == 401
    login = client.post(
        "/api/admin/auth/login",
        json={"email": "admin@example.com", "password": "test-admin-password"},
    )
    assert login.status_code == 200
    order = create(environment, payload)
    variant_id = payload["items"][0]["variant_id"]
    path = f"/api/admin/inventory/{variant_id}"
    assert (
        client.patch(
            path,
            json={"stock_on_hand": 1, "expected_stock_on_hand": 40},
            headers=headers,
        ).status_code
        == 409
    )
    assert (
        client.patch(
            path,
            json={"stock_on_hand": 50, "expected_stock_on_hand": 39},
            headers=headers,
        ).status_code
        == 409
    )
    assert (
        client.patch(
            path,
            json={"stock_on_hand": 50, "expected_stock_on_hand": 40},
            headers=headers,
        ).status_code
        == 200
    )
    path = f"/api/admin/orders/{order['id']}/status"
    assert (
        client.patch(path, json={"status": "PACKED"}, headers=headers).status_code
        == 409
    )
    client.post(
        f"/api/dev/orders/{order['id']}/pay",
        headers={"X-Order-Token": order["order_token"]},
    )
    assert (
        client.patch(path, json={"status": "DELIVERED"}, headers=headers).status_code
        == 409
    )
    assert (
        client.patch(path, json={"status": "PACKED"}, headers=headers).status_code
        == 200
    )
    assert (
        client.patch(path, json={"status": "SHIPPED"}, headers=headers).status_code
        == 422
    )
    assert (
        client.patch(
            path,
            json={
                "status": "SHIPPED",
                "carrier": "Test courier",
                "tracking_number": "AWB123",
            },
            headers=headers,
        ).status_code
        == 200
    )
    assert (
        client.patch(path, json={"status": "DELIVERED"}, headers=headers).status_code
        == 200
    )


def test_reviews_require_delivered_purchase_and_moderation(environment, payload):
    order = create(environment, payload)
    client, headers = environment["client"], environment["admin_headers"]
    path = f"/api/products/{environment['product']['slug']}/reviews"
    body = {
        "order_id": order["id"],
        "rating": 5,
        "title": "Great cashews",
        "body": "Enjoyed this product with my family.",
    }
    customer_headers = {"X-Order-Token": order["order_token"]}
    assert client.post(path, json=body, headers=customer_headers).status_code == 403
    client.post(f"/api/dev/orders/{order['id']}/pay", headers=customer_headers)
    with environment["factory"]() as db:
        db.get(Order, order["id"]).status = OrderStatus.DELIVERED
        db.commit()
    assert client.post(path, json=body, headers=customer_headers).status_code == 201
    assert client.get("/api/reviews").json() == []
    review = client.get("/api/admin/reviews", headers=headers).json()[0]
    assert (
        client.patch(
            f"/api/admin/reviews/{review['id']}",
            json={"approved": True},
            headers=headers,
        ).status_code
        == 200
    )
    assert client.get("/api/reviews").json()[0]["verified_purchase"] is True
    assert client.post(path, json=body, headers=customer_headers).status_code == 409


def test_production_disallows_mock_payments_and_development_secrets():
    with pytest.raises(ValueError):
        Settings(app_env="production", payment_provider="mock")


def test_provider_timeout_retry_preserves_one_reservation(environment, payload):
    key = str(uuid.uuid4())
    original = environment["gateway"].create_order

    def timeout(_):
        raise HTTPException(503, "Provider temporarily unavailable")

    environment["gateway"].create_order = timeout
    client = environment["client"]
    assert (
        client.post(
            "/api/orders/create", json=payload, headers={"Idempotency-Key": key}
        ).status_code
        == 503
    )
    with environment["factory"]() as db:
        assert db.scalar(select(func.count(Order.id))) == 1
        assert (
            db.get(ProductVariant, payload["items"][0]["variant_id"]).reserved_stock
            == 2
        )
    environment["gateway"].create_order = original
    order = create(environment, payload, key)
    with environment["factory"]() as db:
        assert (
            db.get(ProductVariant, payload["items"][0]["variant_id"]).reserved_stock
            == 2
        )
        assert db.get(Order, order["id"]).razorpay_order_id


def test_authorized_payment_holds_stock_and_provider_failure_does_not_expire(
    environment, payload
):
    order = create(environment, payload)
    with environment["factory"]() as db:
        db.get(Order, order["id"]).reservation_expires_at = now() - timedelta(minutes=1)
        db.commit()
    environment["gateway"].order_payments = [payment(order, status="authorized")]
    with environment["factory"]() as db:
        reconcile_expired_orders(db, environment["gateway"])
        assert db.get(Order, order["id"]).stock_reserved is True
        assert db.get(Order, order["id"]).payment_status == PaymentStatus.PENDING

    def timeout(_):
        raise HTTPException(503, "Provider unavailable")

    environment["gateway"].payments_for_order = timeout
    with environment["factory"]() as db:
        with pytest.raises(HTTPException):
            reconcile_expired_orders(db, environment["gateway"])
    with environment["factory"]() as db:
        assert db.get(Order, order["id"]).payment_status == PaymentStatus.PENDING


@pytest.mark.postgres
def test_postgres_simultaneous_checkout_retries_return_one_order(environment, payload):
    if environment["engine"].dialect.name != "postgresql":
        pytest.skip("Run with TEST_DATABASE_URL for PostgreSQL row-lock coverage")
    key = str(uuid.uuid4())

    def buyer(_):
        with environment["factory"]() as db:
            return reserve_order(
                db, CreateOrderInput(**payload), key, environment["gateway"]
            ).id

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(buyer, [1, 2]))
    assert results[0] == results[1]
    with environment["factory"]() as db:
        assert db.scalar(select(func.count(Order.id))) == 1
        assert (
            db.get(ProductVariant, payload["items"][0]["variant_id"]).reserved_stock
            == 2
        )


@pytest.mark.postgres
def test_postgres_concurrent_buyers_cannot_oversell_last_pack(environment, payload):
    if environment["engine"].dialect.name != "postgresql":
        pytest.skip("Run with TEST_DATABASE_URL for PostgreSQL row-lock coverage")
    payload["items"][0]["quantity"] = 1
    with environment["factory"]() as db:
        db.get(ProductVariant, payload["items"][0]["variant_id"]).stock_on_hand = 1
        db.commit()

    def buyer(_):
        with environment["factory"]() as db:
            try:
                reserve_order(
                    db,
                    CreateOrderInput(**payload),
                    str(uuid.uuid4()),
                    environment["gateway"],
                )
                return 201
            except HTTPException as error:
                db.rollback()
                return error.status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(buyer, [1, 2]))
    assert sorted(results) == [201, 409]
    with environment["factory"]() as db:
        assert (
            db.get(ProductVariant, payload["items"][0]["variant_id"]).reserved_stock
            == 1
        )
