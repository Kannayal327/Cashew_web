from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    database_url: str = "sqlite:///./farmdirect.db"
    cors_origins: str = "http://localhost:3000"
    jwt_secret: str = "development-only-jwt-secret-change-before-launch"
    order_token_secret: str = "development-only-order-secret-change-before-launch"
    jwt_issuer: str = "farmdirect-api"
    jwt_audience: str = "farmdirect-admin"
    admin_token_minutes: int = 30
    payment_provider: str = "razorpay"
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    razorpay_previous_webhook_secret: str = ""
    redis_url: str = ""
    reservation_minutes: int = 20
    free_shipping_threshold_paise: int = 99900
    shipping_fee_paise: int = 6900
    # Explicit allowlist; replace with your carrier's verified coverage before launch.
    serviceable_pincodes: str = "600001,600020,600042,600100,605001,607001,607002,608001,560001,560034,400001,110001,500001,700001"
    welcome_coupon: str = "FARM10"
    coupon_minimum_paise: int = 49900
    coupon_maximum_discount_paise: int = 15000

    @model_validator(mode="after")
    def validate_production(self):
        if self.payment_provider not in {"razorpay", "mock"}:
            raise ValueError("PAYMENT_PROVIDER must be razorpay or mock")
        if self.app_env == "production":
            for value in (self.jwt_secret, self.order_token_secret):
                if len(value) < 40 or "development-only" in value:
                    raise ValueError(
                        "Production secrets must be independent random values of at least 40 characters"
                    )
            if self.jwt_secret == self.order_token_secret:
                raise ValueError("JWT_SECRET and ORDER_TOKEN_SECRET must differ")
            if not self.database_url.startswith(("postgres", "postgresql")):
                raise ValueError("Production requires PostgreSQL")
            if self.payment_provider != "razorpay" or not all(
                (
                    self.razorpay_key_id,
                    self.razorpay_key_secret,
                    self.razorpay_webhook_secret,
                )
            ):
                raise ValueError(
                    "Production requires Razorpay credentials and a webhook secret"
                )
            if not self.redis_url:
                raise ValueError("Production requires REDIS_URL for shared rate limits")
            if not self.origins or any(
                urlsplit(origin).scheme != "https"
                or not urlsplit(origin).netloc
                or urlsplit(origin).path
                for origin in self.origins
            ):
                raise ValueError("Production CORS origins must use HTTPS")
        return self

    @property
    def origins(self):
        return [
            origin.strip().rstrip("/")
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]

    @property
    def pincodes(self):
        return {
            code.strip()
            for code in self.serviceable_pincodes.split(",")
            if code.strip()
        }


@lru_cache
def get_settings():
    return Settings()
