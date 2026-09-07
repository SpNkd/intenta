import re
import secrets
from datetime import UTC, datetime

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AnonymousUser, Intention, RecoveryCredential

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
    public_id = secrets.token_hex(8)
    secret = secrets.token_hex(24)
    db.add(
        RecoveryCredential(user_id=user_id, public_id=public_id, secret_hash=hasher.hash(secret))
    )
    await db.flush()
    return f"INTENTA-{public_id}-{secret}"


async def replace_credential(db: AsyncSession, user_id: object) -> str:
    credential = await db.scalar(
        select(RecoveryCredential)
        .where(
            RecoveryCredential.user_id == user_id,
            RecoveryCredential.disabled_at.is_(None),
        )
        .with_for_update()
    )
    if credential is None:
        raise ValueError("no active recovery credential exists")
    credential.disabled_at = datetime.now(UTC)
    await db.flush()
    return await issue_credential(db, user_id)


def parse_code(code: str) -> tuple[str, str] | None:
    match = re.fullmatch(r"INTENTA-([a-f0-9]{16})-([a-f0-9]{48})", code.strip())
    return (match.group(1), match.group(2)) if match else None


async def verify_credential(db: AsyncSession, code: str) -> AnonymousUser | None:
    parsed = parse_code(code)
    if parsed is None:
        return None
    public_id, secret = parsed
    credential = await db.scalar(
        select(RecoveryCredential).where(
            RecoveryCredential.public_id == public_id, RecoveryCredential.disabled_at.is_(None)
        )
    )
    if credential is None:
        return None
    try:
        hasher.verify(credential.secret_hash, secret)
    except VerificationError:
        return None
    user = await db.get(AnonymousUser, credential.user_id)
    if user is None or user.status != "active":
        return None
    credential.last_used_at = datetime.now(UTC)
    await db.flush()
    return user
