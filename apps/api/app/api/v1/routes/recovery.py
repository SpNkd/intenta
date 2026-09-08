from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select

from app.api.dependencies import Configuration, CsrfProtectedAuth, Database
from app.core.rate_limit import FixedWindowRateLimiter
from app.core.security import set_session_cookie
from app.models import RecoveryCredential
from app.schemas.recovery import (
    RecoveryAcknowledgementResponse,
    RecoveryCredentialResponse,
    RecoveryLoginRequest,
)
from app.services.auth import create_session_for_user
from app.services.recovery import (
    issue_credential,
    recovery_rate_limit_scope,
    replace_credential,
    verify_credential,
)

router = APIRouter(prefix="/me", tags=["recovery"])
auth_router = APIRouter(prefix="/auth", tags=["recovery"])
recovery_rate_limiter = FixedWindowRateLimiter(10)
recovery_scoped_rate_limiter = FixedWindowRateLimiter(5)
credential_issuance_rate_limiter = FixedWindowRateLimiter(5)

AUTH_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"description": "Authentication required or recovery code is invalid"},
    403: {"description": "CSRF token or request origin is invalid"},
    409: {"description": "Recovery credential state conflict"},
    429: {"description": "Rate limit exceeded"},
}


@router.post(
    "/recovery-credential",
    response_model=RecoveryCredentialResponse,
    responses=AUTH_ERROR_RESPONSES,
    operation_id="issueRecoveryCredential",
)
async def issue_recovery_credential(
    request: Request, response: Response, db: Database, auth: CsrfProtectedAuth
) -> RecoveryCredentialResponse:
    key = request.client.host if request.client else "unknown"
    if not await credential_issuance_rate_limiter.allow(key):
        raise HTTPException(status_code=429, detail="Too many requests")
    try:
        code = await issue_credential(db, auth.user.id)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    await db.commit()
    response.headers["Cache-Control"] = "no-store"
    return RecoveryCredentialResponse(code=code)


@router.post(
    "/recovery-credential/replacement",
    response_model=RecoveryCredentialResponse,
    responses=AUTH_ERROR_RESPONSES,
    operation_id="replaceRecoveryCredential",
)
async def replace_recovery_credential(
    request: Request, response: Response, db: Database, auth: CsrfProtectedAuth
) -> RecoveryCredentialResponse:
    key = request.client.host if request.client else "unknown"
    if not await credential_issuance_rate_limiter.allow(key):
        raise HTTPException(status_code=429, detail="Too many requests")
    try:
        code = await replace_credential(db, auth.user.id)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    auth.user.recovery_code_acknowledged_at = None
    await db.commit()
    response.headers["Cache-Control"] = "no-store"
    return RecoveryCredentialResponse(code=code)


@router.post(
    "/recovery-code-acknowledgement",
    response_model=RecoveryAcknowledgementResponse,
    responses=AUTH_ERROR_RESPONSES,
    operation_id="acknowledgeRecoveryCode",
)
async def acknowledge_recovery_code(
    response: Response, db: Database, auth: CsrfProtectedAuth
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
    response.headers["Cache-Control"] = "no-store"
    return RecoveryAcknowledgementResponse(acknowledged=True)


@auth_router.post(
    "/recover",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses={
        401: {"description": "Recovery code is invalid"},
        429: {"description": "Rate limit exceeded"},
    },
    operation_id="recoverWithCode",
)
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
    scope = recovery_rate_limit_scope(payload.code, settings.recovery_rate_limit_hmac_key)
    if not await recovery_scoped_rate_limiter.allow(scope):
        raise HTTPException(status_code=429, detail="Too many requests")
    user = await verify_credential(db, payload.code)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid recovery code")
    token, _ = await create_session_for_user(db, user, session_ttl_days=settings.session_ttl_days)
    await db.commit()
    response.headers["Cache-Control"] = "no-store"
    set_session_cookie(response, settings, token)
