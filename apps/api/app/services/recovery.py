import hashlib
import hmac
import re
import secrets
from datetime import UTC, datetime

import anyio
from argon2 import PasswordHasher, Type
from argon2.exceptions import VerificationError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import AnonymousUser, Intention, RecoveryCredential

# Conservative first production baseline: Argon2id, 19 MiB, two iterations, one lane.
hasher = PasswordHasher(time_cost=2, memory_cost=19_456, parallelism=1, hash_len=32, type=Type.ID)
argon2_limiter = anyio.CapacityLimiter(get_settings().argon2_max_concurrency)
DUMMY_SECRET_HASH = hasher.hash(secrets.token_urlsafe(24))
CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
PUBLIC_ID_LENGTH = 8
SECRET_LENGTH = 20
PUBLIC_ID_UNIQUE_CONSTRAINT = "recovery_credentials_public_id_key"


def _encode_crockford(value: int, length: int) -> str:
    characters = ["0"] * length
    for index in range(length - 1, -1, -1):
        value, remainder = divmod(value, len(CROCKFORD_ALPHABET))
        characters[index] = CROCKFORD_ALPHABET[remainder]
    return "".join(characters)


def generate_recovery_parts() -> tuple[str, str]:
    return (
        _encode_crockford(secrets.randbits(PUBLIC_ID_LENGTH * 5), PUBLIC_ID_LENGTH),
        _encode_crockford(secrets.randbits(SECRET_LENGTH * 5), SECRET_LENGTH),
    )


def _constraint_name(error: IntegrityError) -> str | None:
    diagnostics = getattr(error.orig, "diag", None)
    return getattr(diagnostics, "constraint_name", None)


async def issue_credential(db: AsyncSession, user_id: object) -> str:
    await db.execute(select(AnonymousUser.id).where(AnonymousUser.id == user_id).with_for_update())
    activated = await db.scalar(
        select(Intention.id).where(
            Intention.user_id == user_id,
            Intention.activated_at.is_not(None),
        )
    )
    if activated is None:
        raise ValueError("an activated intention is required")
    existing = await db.scalar(
        select(RecoveryCredential.id).where(
            RecoveryCredential.user_id == user_id, RecoveryCredential.disabled_at.is_(None)
        )
    )
    if existing is not None:
        raise ValueError("an active recovery credential already exists")
    for _ in range(5):
        public_id, secret = generate_recovery_parts()
        try:
            async with db.begin_nested():
                db.add(
                    RecoveryCredential(
                        user_id=user_id,
                        public_id=public_id,
                        secret_hash=await hash_recovery_secret(secret),
                    )
                )
                await db.flush()
        except IntegrityError as error:
            if _constraint_name(error) == PUBLIC_ID_UNIQUE_CONSTRAINT:
                continue
            raise
        return f"INTENTA-{public_id}-{secret}"
    raise RuntimeError("unable to generate a unique recovery credential")


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
    normalized = re.sub(r"[\s-]+", "", code.upper())
    if not normalized.startswith("INTENTA"):
        return None
    payload = normalized[len("INTENTA") :]
    if len(payload) != PUBLIC_ID_LENGTH + SECRET_LENGTH:
        return None
    if any(character not in CROCKFORD_ALPHABET for character in payload):
        return None
    return payload[:PUBLIC_ID_LENGTH], payload[PUBLIC_ID_LENGTH:]


def recovery_rate_limit_scope(code: str, hmac_key: str) -> str:
    parsed = parse_code(code)
    public_id = parsed[0] if parsed else "invalid"
    return hmac.new(hmac_key.encode(), public_id.encode(), hashlib.sha256).hexdigest()


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
        await verify_recovery_secret(DUMMY_SECRET_HASH, secret)
        return None
    if not await verify_recovery_secret(credential.secret_hash, secret):
        return None
    verified_user_id = await db.scalar(
        update(RecoveryCredential)
        .where(
            RecoveryCredential.id == credential.id,
            RecoveryCredential.disabled_at.is_(None),
        )
        .values(last_used_at=datetime.now(UTC))
        .returning(RecoveryCredential.user_id)
    )
    if verified_user_id is None:
        return None
    user = await db.get(AnonymousUser, verified_user_id)
    if user is None or user.status != "active":
        return None
    return user


async def hash_recovery_secret(secret: str) -> str:
    return await anyio.to_thread.run_sync(hasher.hash, secret, limiter=argon2_limiter)


async def verify_recovery_secret(encoded_hash: str, secret: str) -> bool:
    try:
        return await anyio.to_thread.run_sync(
            hasher.verify, encoded_hash, secret, limiter=argon2_limiter
        )
    except VerificationError:
        return False
