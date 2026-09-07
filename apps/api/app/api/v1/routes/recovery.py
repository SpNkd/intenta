from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select

from app.api.dependencies import Configuration, CsrfProtectedAuth, Database
from app.core.rate_limit import FixedWindowRateLimiter
from app.models import RecoveryCredential
from app.schemas.recovery import (
    RecoveryAcknowledgementResponse,
    RecoveryCredentialResponse,
    RecoveryLoginRequest,
)
from app.services.auth import create_session_for_user
from app.services.recovery import issue_credential, verify_credential

router = APIRouter(prefix="/me", tags=["recovery"])
auth_router = APIRouter(prefix="/auth", tags=["recovery"])
recovery_rate_limiter = FixedWindowRateLimiter(10)


@router.post(
    "/recovery-credential",
    response_model=RecoveryCredentialResponse,
    operation_id="issueRecoveryCredential",
)
async def issue_recovery_credential(
    db: Database, auth: CsrfProtectedAuth
) -> RecoveryCredentialResponse:
    try:
        code = await issue_credential(db, auth.user.id)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    await db.commit()
    return RecoveryCredentialResponse(code=code)


@router.post(
    "/recovery-code-acknowledgement",
    response_model=RecoveryAcknowledgementResponse,
    operation_id="acknowledgeRecoveryCode",
)
async def acknowledge_recovery_code(
    db: Database, auth: CsrfProtectedAuth
) -> RecoveryAcknowledgementResponse:
    credential = await db.scalar(
        select(RecoveryCredential.id).where(
            RecoveryCredential.user_id == auth.user.id, RecoveryCredential.disabled_at.is_(None)
        )
    )
    if credential is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="No active recovery credential"
        )
    if auth.user.recovery_code_acknowledged_at is None:
        auth.user.recovery_code_acknowledged_at = datetime.now(UTC)
        await db.commit()
    return RecoveryAcknowledgementResponse(acknowledged=True)


@auth_router.post("/recover", response_model=None, operation_id="recoverWithCode")
async def recover_with_code(
    request: Request,
    response: Response,
    payload: RecoveryLoginRequest,
    db: Database,
    settings: Configuration,
) -> None:
    key = request.client.host if request.client else "unknown"
    if not await recovery_rate_limiter.allow(key):
        raise HTTPException(status_code=429, detail="Too many requests")
    user = await verify_credential(db, payload.code)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid recovery code")
    token, _ = await create_session_for_user(db, user, session_ttl_days=settings.session_ttl_days)
    await db.commit()
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_ttl_days * 86400,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )
