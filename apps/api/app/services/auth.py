from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_token, hash_token
from app.models import AnonymousUser, Session


@dataclass(frozen=True, slots=True)
class AuthContext:
    user: AnonymousUser
    session: Session


async def resolve_session(db: AsyncSession, raw_token: str | None) -> AuthContext | None:
    if not raw_token:
        return None
    result = await db.execute(
        select(Session, AnonymousUser)
        .join(AnonymousUser, Session.user_id == AnonymousUser.id)
        .where(
            Session.token_hash == hash_token(raw_token),
            Session.revoked_at.is_(None),
            Session.expires_at > datetime.now(UTC),
            AnonymousUser.status == "active",
        )
    )
    row = result.one_or_none()
    if row is None:
        return None
    session, user = row
    return AuthContext(user=user, session=session)


async def create_anonymous_session(
    db: AsyncSession, *, session_ttl_days: int
) -> tuple[AuthContext, str, str]:
    session_token = generate_token()
    csrf_token = generate_token()
    user = AnonymousUser()
    session = Session(
        user=user,
        token_hash=hash_token(session_token),
        csrf_token_hash=hash_token(csrf_token),
        expires_at=datetime.now(UTC) + timedelta(days=session_ttl_days),
    )
    db.add_all([user, session])
    await db.flush()
    await db.refresh(user)
    return AuthContext(user=user, session=session), session_token, csrf_token


async def create_session_for_user(
    db: AsyncSession, user: AnonymousUser, *, session_ttl_days: int
) -> tuple[str, str]:
    session_token = generate_token()
    csrf_token = generate_token()
    db.add(
        Session(
            user_id=user.id,
            token_hash=hash_token(session_token),
            csrf_token_hash=hash_token(csrf_token),
            expires_at=datetime.now(UTC) + timedelta(days=session_ttl_days),
        )
    )
    await db.flush()
    return session_token, csrf_token


async def rotate_csrf_token(db: AsyncSession, context: AuthContext) -> str:
    csrf_token = generate_token()
    context.session.csrf_token_hash = hash_token(csrf_token)
    await db.flush()
    return csrf_token
