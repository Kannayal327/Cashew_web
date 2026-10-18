import hashlib
import hmac
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import User

password_hasher = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
# Keeps a missing user's login path computationally comparable to a real user's.
dummy_hash = password_hasher.hash("not-a-real-admin-password")


def issue_token(user: User):
    settings = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": user.id,
            "iat": now,
            "exp": now + timedelta(minutes=settings.admin_token_minutes),
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
        },
        settings.jwt_secret,
        algorithm="HS256",
    )


def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    try:
        if credentials is None:
            raise ValueError()
        claims = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=["HS256"],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "exp", "iat", "iss", "aud"]},
        )
        user = db.get(User, claims["sub"])
        if not user or not user.is_admin or not user.active:
            raise ValueError()
        return user
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(
            401,
            "Administrator authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )


def order_token(order_id: str):
    return hmac.new(
        get_settings().order_token_secret.encode(),
        f"track:{order_id}".encode(),
        hashlib.sha256,
    ).hexdigest()


def require_order_token(order_id: str, supplied: str):
    if not hmac.compare_digest(order_token(order_id).encode(), supplied.encode()):
        raise HTTPException(404, "Order not found")
