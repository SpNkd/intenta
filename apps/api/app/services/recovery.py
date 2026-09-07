import hashlib
import hmac
import re
import secrets
from datetime import UTC, datetime

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AnonymousUser, Intention, RecoveryCredential

hasher = PasswordHasher()
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
    for _ in range(5):
        public_id, secret = generate_recovery_parts()
        try:
            async with db.begin_nested():
                db.add(
                    RecoveryCredential(
                        user_id=user_id,
                        public_id=public_id,
                        secret_hash=hasher.hash(secret),
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
        try:
            hasher.verify(DUMMY_SECRET_HASH, secret)
        except VerificationError:
            pass
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
