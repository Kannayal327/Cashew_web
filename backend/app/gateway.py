import hashlib
import hmac

import httpx
from fastapi import HTTPException

from .config import get_settings


class RazorpayGateway:
    def __init__(self):
        self.settings = get_settings()

    def request(self, method: str, path: str, **kwargs):
        if not self.settings.razorpay_key_id or not self.settings.razorpay_key_secret:
            raise HTTPException(
                503, "Payments are not configured. Please contact the store."
            )
        try:
            with httpx.Client(
                base_url="https://api.razorpay.com/v1/",
                auth=(self.settings.razorpay_key_id, self.settings.razorpay_key_secret),
                timeout=httpx.Timeout(12.0, connect=4.0),
            ) as client:
                response = client.request(method, path, **kwargs)
                response.raise_for_status()
                return response.json()
        except (httpx.HTTPError, ValueError):
            # Deliberately omit gateway response bodies, which can contain PII.
            raise HTTPException(
                503,
                "Payment service is temporarily unavailable. Retry with the same checkout.",
            )

    def create_order(self, order):
        return self.request(
            "POST",
            "orders",
            json={
                "amount": order.total_paise,
                "currency": "INR",
                "receipt": order.reference,
                "notes": {"store_order_id": order.id},
            },
        )

    def payment(self, payment_id):
        return self.request("GET", f"payments/{payment_id}")

    def payments_for_order(self, gateway_order_id):
        return self.request("GET", f"orders/{gateway_order_id}/payments").get(
            "items", []
        )


class MockGateway:
    """Development only. Never loaded in production (settings enforce this)."""

    def create_order(self, order):
        return {
            "id": "order_demo_" + order.id.replace("-", ""),
            "amount": order.total_paise,
            "currency": "INR",
        }

    def payments_for_order(self, gateway_order_id):
        return []


def get_gateway():
    return (
        MockGateway()
        if get_settings().payment_provider == "mock"
        else RazorpayGateway()
    )


def valid_signature(message: bytes, signature: str, secret: str):
    return bool(secret) and hmac.compare_digest(
        hmac.new(secret.encode(), message, hashlib.sha256).hexdigest().encode(),
        signature.encode(),
    )
