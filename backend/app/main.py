import hashlib
import json
import logging
import re
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from .commerce import (
    apply_captured_payment,
    created_response,
    lock_order,
    quote,
    reserve_order,
    utc,
)
from .config import get_settings
from .database import get_db
from .gateway import get_gateway, valid_signature
from .models import (
    AdminAudit,
    Order,
    OrderEvent,
    OrderStatus,
    PaymentStatus,
    Product,
    ProductReview,
    ProductVariant,
    User,
    WebhookEvent,
)
from .schemas import (
    CreateOrderInput,
    InventoryUpdate,
    LoginInput,
    OrderCreated,
    ProductOutput,
    QuoteInput,
    QuoteOutput,
    ReviewInput,
    ReviewModeration,
    StatusUpdate,
    VerifyPaymentInput,
)
from .security import (
    dummy_hash,
    issue_token,
    password_hasher,
    require_admin,
    require_order_token,
)

settings = get_settings()
logger = logging.getLogger("farmdirect")
limiter = Limiter(
    key_func=get_remote_address, storage_uri=settings.redis_url or "memory://"
)
app = FastAPI(
    title="FarmDirect Cashews API",
    version="1.0.0",
    docs_url="/docs" if settings.app_env != "production" else None,
    redoc_url=None,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "Idempotency-Key", "X-Order-Token"],
)
rate_limit_redis = (
    Redis.from_url(settings.redis_url, socket_connect_timeout=2, socket_timeout=2)
    if settings.redis_url
    else None
)


@app.middleware("http")
async def headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.url.path.startswith(
        ("/api/orders", "/api/payments", "/api/admin", "/api/checkout")
    ):
        response.headers["Cache-Control"] = "no-store"
    if settings.app_env == "production":
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
    return response


@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    db.execute(select(Product.id).limit(1))  # readiness includes the migration
    if rate_limit_redis:
        try:
            rate_limit_redis.ping()
        except RedisError:
            raise HTTPException(503, "Rate limit storage unavailable")
    return {"status": "ok", "payments": settings.payment_provider}


@app.get("/api/products", response_model=list[ProductOutput])
def products(
    category: str | None = Query(default=None, max_length=40),
    grade: str | None = Query(default=None, max_length=20),
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = select(Product).where(Product.active.is_(True))
    if category:
        query = query.where(Product.category == category)
    if grade:
        query = query.where(Product.grade == grade)
    return db.scalars(query.order_by(Product.name).offset(offset).limit(limit)).all()


@app.get("/api/products/{slug}", response_model=ProductOutput)
def product(slug: str, db: Session = Depends(get_db)):
    product = db.scalar(
        select(Product).where(Product.slug == slug, Product.active.is_(True))
    )
    if not product:
        raise HTTPException(404, "Product not found")
    return product


@app.get("/api/delivery/{pincode}")
@limiter.limit("60/minute")
def delivery(request: Request, pincode: str):
    if not re.fullmatch(r"[1-9][0-9]{5}", pincode):
        raise HTTPException(422, "Enter a valid six-digit Indian PIN code")
    return {
        "serviceable": pincode in settings.pincodes,
        "estimate": "3–7 business days",
        "shipping_fee_paise": settings.shipping_fee_paise,
        "free_shipping_threshold_paise": settings.free_shipping_threshold_paise,
    }


@app.post("/api/checkout/quote", response_model=QuoteOutput)
@limiter.limit("30/minute")
def checkout_quote(
    request: Request, payload: QuoteInput, db: Session = Depends(get_db)
):
    return quote(db, payload)


@app.post("/api/orders/create", response_model=OrderCreated, status_code=201)
@limiter.limit("10/minute")
def create_order(
    request: Request,
    payload: CreateOrderInput,
    idempotency_key: Annotated[
        str,
        Header(
            min_length=16, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$|^[a-f0-9-]{36}$"
        ),
    ],
    db: Session = Depends(get_db),
    gateway=Depends(get_gateway),
):
    if settings.payment_provider == "razorpay" and not (
        settings.razorpay_key_id and settings.razorpay_key_secret
    ):
        raise HTTPException(
            503, "Payments are not configured. Please contact the store."
        )
    return created_response(reserve_order(db, payload, idempotency_key, gateway))


def tracking_output(order):
    # No email, telephone, address, or payment token in tracking responses.
    return {
        "id": order.id,
        "reference": order.reference,
        "status": order.status,
        "payment_status": order.payment_status,
        "created_at": utc(order.created_at),
        "total_paise": order.total_paise,
        "carrier": order.carrier,
        "tracking_number": order.tracking_number,
        "items": [
            {
                "product_name": item.product_name,
                "product_slug": item.variant.product.slug,
                "weight_grams": item.weight_grams,
                "quantity": item.quantity,
            }
            for item in order.items
        ],
        "events": [
            {"message": event.message, "created_at": utc(event.created_at)}
            for event in order.events
        ],
    }


@app.get("/api/orders/{order_id}/track")
@limiter.limit("30/minute")
def track_order(
    request: Request,
    order_id: str,
    x_order_token: Annotated[str, Header(max_length=100)] = "",
    db: Session = Depends(get_db),
):
    require_order_token(order_id, x_order_token)
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Order not found")
    return tracking_output(order)


@app.post("/api/payments/verify")
@limiter.limit("20/minute")
def verify_payment(
    request: Request,
    payload: VerifyPaymentInput,
    x_order_token: Annotated[str, Header(max_length=100)] = "",
    db: Session = Depends(get_db),
    gateway=Depends(get_gateway),
):
    require_order_token(payload.order_id, x_order_token)
    order = db.get(Order, payload.order_id)
    if (
        not order
        or order.payment_provider != "razorpay"
        or order.razorpay_order_id != payload.razorpay_order_id
    ):
        raise HTTPException(400, "Payment order mismatch")
    message = f"{order.razorpay_order_id}|{payload.razorpay_payment_id}".encode()
    if not valid_signature(
        message, payload.razorpay_signature, settings.razorpay_key_secret
    ):
        raise HTTPException(401, "Invalid payment signature")
    payment = gateway.payment(payload.razorpay_payment_id)
    order = lock_order(db, order.id)
    if (
        payment.get("order_id") != order.razorpay_order_id
        or payment.get("amount") != order.total_paise
        or payment.get("currency") != "INR"
    ):
        raise HTTPException(400, "Payment details do not match this order")
    if payment.get("status") == "captured":
        apply_captured_payment(db, order, payment)
        db.commit()
    return {"payment_status": order.payment_status, "reference": order.reference}


def process_webhook(db, raw, signature, event_id):
    if not any(
        valid_signature(raw, signature, secret)
        for secret in [
            settings.razorpay_webhook_secret,
            settings.razorpay_previous_webhook_secret,
        ]
        if secret
    ):
        raise HTTPException(401, "Invalid webhook signature")
    try:
        event = json.loads(raw)
        if not isinstance(event, dict) or not isinstance(event.get("event"), str):
            raise ValueError()
        kind = event["event"]
        if kind not in {"payment.captured", "order.paid"}:
            return {"received": True, "ignored": True}
        payment = event["payload"]["payment"]["entity"]
        if not isinstance(payment, dict) or not isinstance(
            payment.get("order_id"), str
        ):
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise HTTPException(400, "Malformed webhook")
    body_hash = hashlib.sha256(raw).hexdigest()
    event_id = event_id or body_hash
    previous = db.get(WebhookEvent, event_id)
    if previous:
        if previous.body_hash != body_hash:
            raise HTTPException(409, "Webhook event ID conflict")
        return {"received": True, "duplicate": True}
    order = db.scalar(
        select(Order).where(Order.razorpay_order_id == payment["order_id"])
    )
    if not order:
        # Could be a provider order created during a timed-out request. Never
        # acknowledge a captured but unreconciled payment as successfully handled.
        logger.error("Unmatched captured payment; inspect Razorpay reconciliation")
        raise HTTPException(503, "Order reconciliation pending")
    if order.payment_provider != "razorpay":
        raise HTTPException(400, "Payment provider mismatch")
    order = lock_order(db, order.id)
    previous = db.get(WebhookEvent, event_id)
    if previous:
        if previous.body_hash != body_hash:
            raise HTTPException(409, "Webhook event ID conflict")
        return {"received": True, "duplicate": True}
    apply_captured_payment(db, order, payment)
    db.add(WebhookEvent(id=event_id, body_hash=body_hash, event_type=kind))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        previous = db.get(WebhookEvent, event_id)
        if not previous or previous.body_hash != body_hash:
            raise HTTPException(409, "Payment event conflict")
    return {"received": True}


@app.post("/api/payments/verify-webhook")
async def verify_webhook(
    request: Request,
    x_razorpay_signature: Annotated[str, Header(max_length=128)] = "",
    x_razorpay_event_id: Annotated[str, Header(max_length=150)] = "",
    db: Session = Depends(get_db),
):
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > 262144:
            raise HTTPException(413, "Webhook too large")
        chunks.append(chunk)
    raw = b"".join(chunks)
    return await run_in_threadpool(
        process_webhook, db, raw, x_razorpay_signature, x_razorpay_event_id
    )


@app.post("/api/admin/auth/login")
@limiter.limit("5/minute")
def login(request: Request, payload: LoginInput, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    valid = password_hasher.verify(
        payload.password, user.password_hash if user else dummy_hash
    )
    if not valid or not user or not user.is_admin or not user.active:
        raise HTTPException(401, "Invalid administrator credentials")
    return {
        "access_token": issue_token(user),
        "token_type": "bearer",
        "expires_in": settings.admin_token_minutes * 60,
    }


@app.get("/api/admin/inventory")
def inventory(
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    variants = db.scalars(
        select(ProductVariant).order_by(ProductVariant.sku).offset(offset).limit(limit)
    ).all()
    return [
        {
            "id": v.id,
            "sku": v.sku,
            "product_name": v.product.name,
            "weight_grams": v.weight_grams,
            "price_paise": v.price_paise,
            "stock_on_hand": v.stock_on_hand,
            "reserved_stock": v.reserved_stock,
            "available_stock": v.available_stock,
        }
        for v in variants
    ]


@app.patch("/api/admin/inventory/{variant_id}")
def update_inventory(
    variant_id: str,
    payload: InventoryUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    variant = db.scalar(
        select(ProductVariant).where(ProductVariant.id == variant_id).with_for_update()
    )
    if not variant:
        raise HTTPException(404, "Variant not found")
    if variant.stock_on_hand != payload.expected_stock_on_hand:
        raise HTTPException(409, "Inventory changed. Refresh before saving.")
    if payload.stock_on_hand < variant.reserved_stock:
        raise HTTPException(409, "Cannot remove stock reserved by unpaid orders")
    before = {
        "stock_on_hand": variant.stock_on_hand,
        "price_paise": variant.price_paise,
    }
    variant.stock_on_hand = payload.stock_on_hand
    if payload.price_paise is not None:
        variant.price_paise = payload.price_paise
    db.add(
        AdminAudit(
            admin_id=admin.id,
            action="inventory.updated",
            entity_id=variant.id,
            changes={
                "before": before,
                "after": {
                    "stock_on_hand": variant.stock_on_hand,
                    "price_paise": variant.price_paise,
                },
            },
        )
    )
    db.commit()
    return {"updated": True, "available_stock": variant.available_stock}


@app.get("/api/admin/orders")
def admin_orders(
    payment_status: PaymentStatus | None = None,
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = select(Order)
    if payment_status:
        query = query.where(Order.payment_status == payment_status)
    orders = db.scalars(
        query.order_by(Order.created_at.desc()).offset(offset).limit(limit)
    ).all()
    return [
        {
            **tracking_output(order),
            "email": order.email,
            "address": {
                field: getattr(order.address, field)
                for field in (
                    "name",
                    "phone",
                    "line1",
                    "line2",
                    "city",
                    "state",
                    "pincode",
                )
            },
        }
        for order in orders
    ]


@app.patch("/api/admin/orders/{order_id}/status")
def update_order_status(
    order_id: str,
    payload: StatusUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    order = lock_order(db, order_id)
    if not order:
        raise HTTPException(404, "Order not found")
    if order.payment_status != PaymentStatus.PAID:
        raise HTTPException(409, "Only paid orders may be fulfilled")
    progression = list(OrderStatus)
    if payload.status == order.status:
        return tracking_output(order)
    if progression.index(payload.status) != progression.index(order.status) + 1:
        raise HTTPException(
            409, "Orders must move through Placed → Packed → Shipped → Delivered"
        )
    if payload.status == OrderStatus.SHIPPED:
        if not payload.carrier or not payload.tracking_number:
            raise HTTPException(
                422, "Carrier and tracking number are required for shipment"
            )
        order.carrier, order.tracking_number = payload.carrier, payload.tracking_number
    previous = order.status
    order.status = payload.status
    order.events.append(OrderEvent(message=f"Order {payload.status.value.lower()}"))
    db.add(
        AdminAudit(
            admin_id=admin.id,
            action="order.status_updated",
            entity_id=order.id,
            changes={"from": previous.value, "to": payload.status.value},
        )
    )
    db.commit()
    return tracking_output(order)


@app.get("/api/reviews")
def reviews(
    product_slug: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=6, ge=1, le=30),
    db: Session = Depends(get_db),
):
    query = (
        select(ProductReview)
        .join(Product)
        .where(ProductReview.approved.is_(True), Product.active.is_(True))
    )
    if product_slug:
        query = query.where(Product.slug == product_slug)
    return [
        {
            "id": review.id,
            "customer_name": review.customer_name,
            "rating": review.rating,
            "title": review.title,
            "body": review.body,
            "created_at": utc(review.created_at),
            "verified_purchase": True,
        }
        for review in db.scalars(
            query.order_by(ProductReview.created_at.desc()).limit(limit)
        ).all()
    ]


@app.post("/api/products/{slug}/reviews", status_code=201)
@limiter.limit("5/minute")
def submit_review(
    request: Request,
    slug: str,
    payload: ReviewInput,
    x_order_token: Annotated[str, Header(max_length=100)] = "",
    db: Session = Depends(get_db),
):
    require_order_token(payload.order_id, x_order_token)
    order = db.get(Order, payload.order_id)
    product = db.scalar(select(Product).where(Product.slug == slug))
    if (
        not order
        or not product
        or order.status != OrderStatus.DELIVERED
        or order.payment_status != PaymentStatus.PAID
        or not any(item.variant.product_id == product.id for item in order.items)
    ):
        raise HTTPException(
            403, "Reviews are available for delivered, paid purchases of this product"
        )
    db.add(
        ProductReview(
            order_id=order.id,
            product_id=product.id,
            customer_name=order.address.name.split()[0],
            rating=payload.rating,
            title=payload.title,
            body=payload.body,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            409, "You have already reviewed this product for this order"
        )
    return {
        "submitted": True,
        "message": "Thank you. Your verified-purchase review is awaiting moderation.",
    }


@app.get("/api/admin/reviews")
def admin_reviews(
    approved: bool = False,
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return [
        {
            "id": review.id,
            "customer_name": review.customer_name,
            "rating": review.rating,
            "title": review.title,
            "body": review.body,
            "approved": review.approved,
        }
        for review in db.scalars(
            select(ProductReview)
            .where(ProductReview.approved == approved)
            .order_by(ProductReview.created_at.desc())
            .offset(offset)
            .limit(limit)
        ).all()
    ]


@app.patch("/api/admin/reviews/{review_id}")
def moderate_review(
    review_id: str,
    payload: ReviewModeration,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    review = db.get(ProductReview, review_id)
    if not review:
        raise HTTPException(404, "Review not found")
    review.approved = payload.approved
    db.add(
        AdminAudit(
            admin_id=admin.id,
            action="review.moderated",
            entity_id=review.id,
            changes={"approved": payload.approved},
        )
    )
    db.commit()
    return {"updated": True}


if settings.app_env != "production" and settings.payment_provider == "mock":

    @app.post("/api/dev/orders/{order_id}/pay")
    @limiter.limit("10/minute")
    def mock_payment(
        request: Request,
        order_id: str,
        x_order_token: Annotated[str, Header(max_length=100)] = "",
        db: Session = Depends(get_db),
    ):
        require_order_token(order_id, x_order_token)
        order = lock_order(db, order_id)
        if not order or order.payment_provider != "mock":
            raise HTTPException(404, "Demo order not found")
        apply_captured_payment(
            db,
            order,
            {
                "id": "pay_demo_" + order.id,
                "order_id": order.razorpay_order_id,
                "amount": order.total_paise,
                "currency": "INR",
                "status": "captured",
            },
        )
        db.commit()
        return {"payment_status": order.payment_status, "reference": order.reference}
