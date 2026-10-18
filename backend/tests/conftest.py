import os
from pathlib import Path

os.environ["APP_ENV"] = "test"
os.environ["PAYMENT_PROVIDER"] = "mock"
os.environ["RAZORPAY_KEY_ID"] = "rzp_test_fixture"
os.environ["RAZORPAY_KEY_SECRET"] = "test-key-secret"
os.environ["RAZORPAY_WEBHOOK_SECRET"] = "test-webhook-secret"
os.environ["REDIS_URL"] = ""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.cli import seed
from app.database import Base, get_db, make_engine
from app.gateway import get_gateway
from app.main import app, limiter
from app.models import User
from app.security import issue_token, password_hasher


class FakeGateway:
    def __init__(self):
        self.calls = 0
        self.order_payments = []
        self.fetched_payment = {}

    def create_order(self, order):
        self.calls += 1
        return {
            "id": "order_test_" + order.id.replace("-", ""),
            "amount": order.total_paise,
            "currency": "INR",
        }

    def payments_for_order(self, order_id):
        return self.order_payments

    def payment(self, payment_id):
        return self.fetched_payment


@pytest.fixture
def environment():
    url = os.environ.get("TEST_DATABASE_URL", "")
    if url:
        # Only point this at a disposable test database. Fixtures rebuild tables.
        engine = make_engine(url)
        Base.metadata.drop_all(engine)
    else:
        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as db:
        seed(db)
        admin = User(
            email="admin@example.com",
            password_hash=password_hasher.hash("test-admin-password"),
            is_admin=True,
        )
        db.add(admin)
        db.commit()
        admin_token = issue_token(admin)
    gateway = FakeGateway()

    def override_db():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_gateway] = lambda: gateway
    limiter.enabled = False
    with TestClient(app) as client:
        products = client.get("/api/products").json()
        product = next(p for p in products if p["grade"] == "W-320")
        yield {
            "client": client,
            "factory": factory,
            "gateway": gateway,
            "product": product,
            "admin_headers": {"Authorization": f"Bearer {admin_token}"},
            "engine": engine,
        }
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def payload(environment):
    return {
        "items": [
            {"variant_id": environment["product"]["variants"][0]["id"], "quantity": 2}
        ],
        "email": "buyer@example.com",
        "address": {
            "name": "Test Buyer",
            "phone": "9876543210",
            "line1": "12 Sample Street",
            "line2": "",
            "city": "Chennai",
            "state": "Tamil Nadu",
            "pincode": "600001",
        },
        "coupon": None,
    }
