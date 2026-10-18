import argparse
import getpass
import json
from pathlib import Path

from pydantic import TypeAdapter, EmailStr
from sqlalchemy import select

from .commerce import reconcile_expired_orders
from .database import SessionLocal
from .gateway import get_gateway
from .models import Product, ProductVariant, User
from .security import password_hasher


def seed(db):
    data = json.loads(Path(__file__).with_name("catalog.seed.json").read_text())
    added = 0
    for item in data:
        if db.scalar(select(Product).where(Product.slug == item["slug"])):
            continue  # Never overwrite inventory or live prices on repeat seed.
        values = dict(item)
        variants = values.pop("variants")
        product = Product(**values)
        product.variants = [
            ProductVariant(
                id=v["id"],
                product_id=product.id,
                sku=v["sku"],
                weight_grams=v["weight_grams"],
                price_paise=v["price_paise"],
                stock_on_hand=v["available_stock"],
            )
            for v in variants
        ]
        db.add(product)
        added += 1
    db.commit()
    print(
        f"Added {added} sample products. Replace sample prices and catalog details before launch."
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command", choices=["seed", "create-admin", "expire-reservations"]
    )
    parser.add_argument("--email")
    args = parser.parse_args()
    with SessionLocal() as db:
        if args.command == "seed":
            seed(db)
        elif args.command == "expire-reservations":
            print(
                f"Reconciled {reconcile_expired_orders(db, get_gateway())} expired checkout attempts"
            )
        else:
            email = str(
                TypeAdapter(EmailStr).validate_python(
                    args.email or input("Admin email: ")
                )
            ).lower()
            if db.scalar(select(User).where(User.email == email)):
                raise SystemExit("User already exists; no changes made")
            password = getpass.getpass("New password (minimum 12 characters): ")
            if len(password) < 12 or password != getpass.getpass("Confirm password: "):
                raise SystemExit(
                    "Passwords must match and contain at least 12 characters"
                )
            db.add(
                User(
                    email=email,
                    password_hash=password_hasher.hash(password),
                    is_admin=True,
                )
            )
            db.commit()
            print("Administrator created")


if __name__ == "__main__":
    main()
