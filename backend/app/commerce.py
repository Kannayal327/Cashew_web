import hashlib
import json
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .models import (
    Address,
    Order,
    OrderEvent,
    OrderItem,
    PaymentStatus,
    PaymentTransaction,
    Product,
    ProductVariant,
    now,
)
from .schemas import CreateOrderInput, QuoteInput
from .security import order_token


def utc(value: datetime):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def quantities(items):
    counts = Counter()
    for item in items:
        counts[item.variant_id] += item.quantity
    if any(count > 20 for count in counts.values()):
        raise HTTPException(422, "Maximum 20 packs of any variant per order")
    return counts


def check_pincode(pincode):
    if pincode not in get_settings().pincodes:
        raise HTTPException(422, "Delivery is not available for this PIN code yet")


def price_totals(subtotal: int, coupon: str | None):
    settings = get_settings()
    discount = 0
    if coupon:
        if coupon != settings.welcome_coupon:
            raise HTTPException(422, "This coupon is not valid")
        if subtotal < settings.coupon_minimum_paise:
            raise HTTPException(
                422,
                f"Coupon requires a minimum order of ₹{settings.coupon_minimum_paise // 100}",
            )
        discount = min(subtotal // 10, settings.coupon_maximum_discount_paise)
    shipping = (
        0
        if subtotal - discount >= settings.free_shipping_threshold_paise
        else settings.shipping_fee_paise
    )
    return {
        "subtotal_paise": subtotal,
        "discount_paise": discount,
        "shipping_paise": shipping,
        "total_paise": subtotal - discount + shipping,
        "coupon": coupon,
        "currency": "INR",
        "free_shipping_threshold_paise": settings.free_shipping_threshold_paise,
    }


def quote(db: Session, payload: QuoteInput):
    check_pincode(payload.pincode)
    counts = quantities(payload.items)
    variants = db.scalars(
        select(ProductVariant)
        .join(Product)
        .where(ProductVariant.id.in_(counts), Product.active.is_(True))
    ).all()
    if len(variants) != len(counts):
        raise HTTPException(422, "A product in your bag is unavailable")
    subtotal = 0
    for variant in variants:
        if variant.available_stock < counts[variant.id]:
            raise HTTPException(409, f"Not enough stock for {variant.sku}")
        subtotal += variant.price_paise * counts[variant.id]
    return price_totals(subtotal, payload.coupon)


def canonical_request_hash(payload):
    data = payload.model_dump(mode="json")
    data["email"] = data["email"].lower()
    data["items"] = [
        {"variant_id": key, "quantity": value}
        for key, value in sorted(quantities(payload.items).items())
    ]
    return hashlib.sha256(
        json.dumps(data, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def lock_order(db, order_id):
    # Avoid PostgreSQL FOR UPDATE on nullable sides of the eager address join.
    return db.scalar(
        select(Order)
        .where(Order.id == order_id)
        .with_for_update(of=Order)
        .execution_options(populate_existing=True)
    )


def release_stock(db, order):
    if not order.stock_reserved:
        return
    for item in sorted(order.items, key=lambda value: value.variant_id):
        result = db.execute(
            update(ProductVariant)
            .where(
                ProductVariant.id == item.variant_id,
                ProductVariant.reserved_stock >= item.quantity,
            )
            .values(reserved_stock=ProductVariant.reserved_stock - item.quantity)
        )
        if result.rowcount != 1:
            raise RuntimeError("Reservation invariant violated")
    order.stock_reserved = False


def reserve_order(db: Session, payload: CreateOrderInput, key: str, gateway):
    request_hash = canonical_request_hash(payload)
    existing = db.scalar(select(Order).where(Order.idempotency_key == key))
    if existing:
        if existing.request_hash != request_hash:
            raise HTTPException(
                409, "Checkout changed. Please start a new checkout attempt."
            )
        return ensure_gateway_order(db, existing.id, gateway)
    check_pincode(payload.address.pincode)
    counts = quantities(payload.items)
    # Consistent locking order reduces deadlocks. Conditional UPDATE below also
    # prevents overselling on SQLite where SELECT FOR UPDATE is unavailable.
    variants = db.scalars(
        select(ProductVariant)
        .join(Product)
        .where(ProductVariant.id.in_(counts), Product.active.is_(True))
        .order_by(ProductVariant.id)
        .with_for_update(of=ProductVariant)
    ).all()
    if len(variants) != len(counts):
        raise HTTPException(422, "A product in your bag is unavailable")
    totals = price_totals(
        sum(variant.price_paise * counts[variant.id] for variant in variants),
        payload.coupon,
    )
    address = Address(**payload.address.model_dump())
    db.add(address)
    db.flush()
    order_id = str(uuid.uuid4())
    order = Order(
        id=order_id,
        reference="FD-" + order_id[:8].upper() + order_id[-4:].upper(),
        idempotency_key=key,
        request_hash=request_hash,
        address_id=address.id,
        email=str(payload.email).lower(),
        reservation_expires_at=now()
        + timedelta(minutes=get_settings().reservation_minutes),
        payment_provider=get_settings().payment_provider,
        **{k: v for k, v in totals.items() if k != "free_shipping_threshold_paise"},
    )
    db.add(order)
    try:
        # Claim the unique idempotency key before any stock update can trigger
        # an autoflush. Concurrent identical requests converge here too.
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(Order).where(Order.idempotency_key == key))
        if existing and existing.request_hash == request_hash:
            return ensure_gateway_order(db, existing.id, gateway)
        raise HTTPException(409, "Checkout changed or conflicted. Please retry.")
    for variant in variants:
        count = counts[variant.id]
        result = db.execute(
            update(ProductVariant)
            .where(
                ProductVariant.id == variant.id,
                ProductVariant.stock_on_hand - ProductVariant.reserved_stock >= count,
            )
            .values(reserved_stock=ProductVariant.reserved_stock + count)
        )
        if result.rowcount != 1:
            db.rollback()
            raise HTTPException(409, f"Not enough stock for {variant.sku}")
        order.items.append(
            OrderItem(
                variant_id=variant.id,
                product_name=variant.product.name,
                sku=variant.sku,
                weight_grams=variant.weight_grams,
                quantity=count,
                unit_price_paise=variant.price_paise,
            )
        )
    order.events.append(OrderEvent(message="Order placed; awaiting payment"))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(Order).where(Order.idempotency_key == key))
        if existing and existing.request_hash == request_hash:
            return ensure_gateway_order(db, existing.id, gateway)
        raise HTTPException(409, "Checkout changed or conflicted. Please retry.")
    return ensure_gateway_order(db, order.id, gateway)


def ensure_gateway_order(db, order_id, gateway):
    order = lock_order(db, order_id)
    if order.payment_status != PaymentStatus.PENDING:
        db.commit()
        return order
    if utc(order.reservation_expires_at) <= now():
        db.commit()
        # Only the reconciler releases expired reservations, after checking the
        # provider for captured or authorized funds.
        raise HTTPException(409, "Checkout expired. Start a new checkout attempt.")
    if not order.razorpay_order_id:
        try:
            # Serialize creation per store order. A timeout may leave an orphaned
            # provider order, but only the committed ID can be used by checkout.
            data = gateway.create_order(order)
            if (
                data.get("amount") != order.total_paise
                or data.get("currency") != "INR"
                or not isinstance(data.get("id"), str)
            ):
                raise HTTPException(502, "Invalid payment provider response")
            order.razorpay_order_id = data["id"]
            db.commit()
        except Exception:
            # Keep the durable reservation for retry/reconciliation; never guess
            # that a timeout means the external order was not created.
            db.rollback()
            raise
    else:
        db.commit()
    return order


def created_response(order):
    settings = get_settings()
    return {
        **{
            key: getattr(order, key)
            for key in (
                "id",
                "reference",
                "subtotal_paise",
                "discount_paise",
                "shipping_paise",
                "total_paise",
                "coupon",
                "currency",
                "razorpay_order_id",
                "payment_provider",
                "payment_status",
            )
        },
        "reservation_expires_at": utc(order.reservation_expires_at),
        "free_shipping_threshold_paise": settings.free_shipping_threshold_paise,
        "razorpay_key_id": settings.razorpay_key_id
        if order.payment_provider == "razorpay"
        else None,
        "order_token": order_token(order.id),
    }


def apply_captured_payment(db, order, payment):
    # Both the callback verification and signed webhook use this exact path.
    if (
        payment.get("order_id") != order.razorpay_order_id
        or payment.get("amount") != order.total_paise
        or payment.get("currency") != order.currency
        or payment.get("status") != "captured"
        or not isinstance(payment.get("id"), str)
    ):
        raise HTTPException(400, "Payment details do not match this order")
    transaction = db.scalar(
        select(PaymentTransaction).where(
            PaymentTransaction.provider_payment_id == payment["id"]
        )
    )
    if transaction:
        if transaction.order_id != order.id:
            raise HTTPException(409, "Payment is already linked to a different order")
        return
    db.add(
        PaymentTransaction(
            order_id=order.id,
            provider_payment_id=payment["id"],
            amount_paise=payment["amount"],
            currency=payment["currency"],
            status="captured",
        )
    )
    if order.payment_status in {PaymentStatus.PAID, PaymentStatus.REVIEW}:
        # A second captured payment is a financial exception, never a second sale.
        order.payment_status = PaymentStatus.REVIEW
        order.events.append(
            OrderEvent(message="Additional payment received; store review required")
        )
        return
    if not order.stock_reserved:
        # A late capture must reacquire stock atomically, or remain REVIEW for a
        # human refund. Never ship from released/possibly sold inventory.
        variants = {
            v.id: v
            for v in db.scalars(
                select(ProductVariant)
                .where(ProductVariant.id.in_([item.variant_id for item in order.items]))
                .order_by(ProductVariant.id)
                .with_for_update()
            ).all()
        }
        if any(
            variants[item.variant_id].available_stock < item.quantity
            for item in order.items
        ):
            order.payment_status = PaymentStatus.REVIEW
            order.events.append(
                OrderEvent(
                    message="Late payment received; stock review or refund required"
                )
            )
            return
        for item in order.items:
            variants[item.variant_id].stock_on_hand -= item.quantity
    else:
        for item in sorted(order.items, key=lambda value: value.variant_id):
            result = db.execute(
                update(ProductVariant)
                .where(
                    ProductVariant.id == item.variant_id,
                    ProductVariant.reserved_stock >= item.quantity,
                    ProductVariant.stock_on_hand >= item.quantity,
                )
                .values(
                    stock_on_hand=ProductVariant.stock_on_hand - item.quantity,
                    reserved_stock=ProductVariant.reserved_stock - item.quantity,
                )
            )
            if result.rowcount != 1:
                raise RuntimeError("Inventory invariant violated during capture")
        order.stock_reserved = False
    order.payment_status = PaymentStatus.PAID
    order.events.append(
        OrderEvent(message="Payment confirmed; your order is being prepared")
    )


def reconcile_expired_orders(db, gateway, limit=100):
    # Run on a dedicated Railway cron service, not an in-process timer.
    ids = db.scalars(
        select(Order.id)
        .where(
            Order.payment_status == PaymentStatus.PENDING,
            Order.reservation_expires_at <= now(),
        )
        .limit(limit)
    ).all()
    db.commit()
    for order_id in ids:
        order = lock_order(db, order_id)
        if order.payment_status != PaymentStatus.PENDING:
            db.commit()
            continue
        try:
            payments = (
                gateway.payments_for_order(order.razorpay_order_id)
                if order.razorpay_order_id
                else []
            )
            captured = [
                payment for payment in payments if payment.get("status") == "captured"
            ]
            if captured:
                for payment in captured:
                    apply_captured_payment(db, order, payment)
            elif any(payment.get("status") == "authorized" for payment in payments):
                # Authorized payments can still capture. Hold stock and review
                # again on the next cron tick; alert on prolonged authorizations.
                db.rollback()
                continue
            else:
                release_stock(db, order)
                order.payment_status = PaymentStatus.EXPIRED
                order.events.append(
                    OrderEvent(message="Checkout expired; stock released")
                )
            db.commit()
        except Exception:
            db.rollback()
            raise  # Fail the job visibly; do not release on a provider timeout.
    return len(ids)
