from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select

from app.api.dependencies import Configuration, CurrentAuth, Database
from app.core.rate_limit import FixedWindowRateLimiter
from app.models import RecoveryCredential
from app.schemas.auth import AnonymousSessionResponse, CsrfResponse, MeResponse
from app.services.auth import (
    AuthContext,
    create_anonymous_session,
    resolve_session,
    rotate_csrf_token,
)
from app.services.intentions import get_flow_state

router = APIRouter(prefix="/auth", tags=["auth"])
anonymous_rate_limiter: FixedWindowRateLimiter | None = None


async def to_me_response(db: Database, auth: AuthContext) -> MeResponse:
    credential_exists = await db.scalar(
        select(RecoveryCredential.id).where(
            RecoveryCredential.user_id == auth.user.id,
            RecoveryCredential.disabled_at.is_(None),
        )
    )
    return MeResponse(
        id=auth.user.id,
        created_at=auth.user.created_at,
        onboarding_completed=auth.user.onboarding_completed_at is not None,
        flow_state=await get_flow_state(db, auth.user),
        credential_exists=credential_exists is not None,
        recovery_code_acknowledged=auth.user.recovery_code_acknowledged_at is not None,
    )


@router.post(
    "/anonymous",
    response_model=AnonymousSessionResponse,
    status_code=status.HTTP_201_CREATED,
    operation_id="createAnonymousSession",
)
async def create_anonymous(
    request: Request,
    response: Response,
    db: Database,
    settings: Configuration,
) -> AnonymousSessionResponse:
    global anonymous_rate_limiter
    if anonymous_rate_limiter is None:
        anonymous_rate_limiter = FixedWindowRateLimiter(settings.anonymous_rate_limit_per_minute)
    client_key = request.client.host if request.client else "unknown"
    if not await anonymous_rate_limiter.allow(client_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many requests"
        )

    existing_token = request.cookies.get(settings.session_cookie_name)
    existing = await resolve_session(db, existing_token)
    if existing is not None:
        csrf_token = await rotate_csrf_token(db, existing)
        await db.commit()
        response.status_code = status.HTTP_200_OK
        response.headers["Cache-Control"] = "no-store"
        return AnonymousSessionResponse(
            user=await to_me_response(db, existing), csrf_token=csrf_token, created=False
        )

    auth, session_token, csrf_token = await create_anonymous_session(
        db, session_ttl_days=settings.session_ttl_days
    )
    await db.commit()
    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_token,
        max_age=settings.session_ttl_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    return AnonymousSessionResponse(
        user=await to_me_response(db, auth), csrf_token=csrf_token, created=True
    )


@router.get("/csrf", response_model=CsrfResponse, operation_id="getCsrfToken")
async def get_csrf_token(response: Response, db: Database, auth: CurrentAuth) -> CsrfResponse:
    csrf_token = await rotate_csrf_token(db, auth)
    await db.commit()
    response.headers["Cache-Control"] = "no-store"
    return CsrfResponse(csrf_token=csrf_token)
