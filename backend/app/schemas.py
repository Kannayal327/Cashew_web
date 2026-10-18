from datetime import datetime
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
)

from .models import OrderStatus, PaymentStatus

Identifier = Annotated[str, StringConstraints(pattern=r"^[a-f0-9-]{36}$")]
Pincode = Annotated[str, StringConstraints(pattern=r"^[1-9][0-9]{5}$")]


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class AddressInput(InputModel):
    name: str = Field(min_length=2, max_length=100)
    phone: str = Field(pattern=r"^[6-9][0-9]{9}$")
    line1: str = Field(min_length=5, max_length=200)
    line2: str = Field(default="", max_length=200)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=100)
    pincode: Pincode


class CartItemInput(InputModel):
    variant_id: Identifier
    quantity: int = Field(ge=1, le=20, strict=True)


class QuoteInput(InputModel):
    items: list[CartItemInput] = Field(min_length=1, max_length=30)
    pincode: Pincode
    coupon: str | None = Field(default=None, max_length=30)

    @field_validator("coupon")
    @classmethod
    def clean_coupon(cls, value):
        return value.upper() if value else None


class CreateOrderInput(InputModel):
    items: list[CartItemInput] = Field(min_length=1, max_length=30)
    email: EmailStr
    address: AddressInput
    coupon: str | None = Field(default=None, max_length=30)

    @field_validator("coupon")
    @classmethod
    def clean_coupon(cls, value):
        return value.upper() if value else None


class VariantOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    sku: str
    weight_grams: int
    price_paise: int
    available_stock: int


class ProductOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    slug: str
    name: str
    subtitle: str
    description: str
    category: str
    grade: str | None
    image: str
    accent: str
    ingredients: str
    variants: list[VariantOutput]


class QuoteOutput(BaseModel):
    subtotal_paise: int
    discount_paise: int
    shipping_paise: int
    total_paise: int
    currency: str = "INR"
    coupon: str | None
    free_shipping_threshold_paise: int
    delivery_estimate: str = "3–7 business days"


class OrderCreated(QuoteOutput):
    id: str
    reference: str
    razorpay_order_id: str | None
    razorpay_key_id: str | None
    payment_provider: str
    payment_status: PaymentStatus
    order_token: str
    reservation_expires_at: datetime


class VerifyPaymentInput(InputModel):
    order_id: Identifier
    razorpay_order_id: str = Field(min_length=6, max_length=100)
    razorpay_payment_id: str = Field(pattern=r"^pay_[a-zA-Z0-9]+$", max_length=100)
    razorpay_signature: str = Field(pattern=r"^[a-f0-9]{64}$")


class LoginInput(InputModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class InventoryUpdate(InputModel):
    stock_on_hand: int = Field(ge=0, le=1000000, strict=True)
    expected_stock_on_hand: int = Field(ge=0, strict=True)
    price_paise: int | None = Field(default=None, gt=0, le=10000000, strict=True)


class StatusUpdate(InputModel):
    status: OrderStatus
    carrier: str | None = Field(default=None, max_length=100)
    tracking_number: str | None = Field(default=None, max_length=100)


class ReviewInput(InputModel):
    order_id: Identifier
    rating: int = Field(ge=1, le=5, strict=True)
    title: str = Field(min_length=3, max_length=100)
    body: str = Field(min_length=10, max_length=1000)


class ReviewModeration(InputModel):
    approved: bool
