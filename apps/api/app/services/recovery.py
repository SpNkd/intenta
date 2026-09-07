import secrets

from argon2 import PasswordHasher
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Intention, RecoveryCredential

hasher = PasswordHasher()


async def issue_credential(db: AsyncSession, user_id: object) -> str:
    active = await db.scalar(
        select(Intention.id).where(Intention.user_id == user_id, Intention.status == "active")
    )
    if active is None:
        raise ValueError("an active intention is required")
    existing = await db.scalar(
        select(RecoveryCredential.id).where(
            RecoveryCredential.user_id == user_id, RecoveryCredential.disabled_at.is_(None)
        )
    )
    if existing is not None:
        raise ValueError("an active recovery credential already exists")
    public_id = secrets.token_urlsafe(9)
    secret = secrets.token_urlsafe(24)
    db.add(
        RecoveryCredential(user_id=user_id, public_id=public_id, secret_hash=hasher.hash(secret))
    )
    await db.flush()
    return f"{public_id}.{secret}"
