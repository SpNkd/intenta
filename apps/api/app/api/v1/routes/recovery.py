from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.dependencies import CsrfProtectedAuth, Database
from app.models import RecoveryCredential
from app.schemas.recovery import RecoveryAcknowledgementResponse, RecoveryCredentialResponse
from app.services.recovery import issue_credential

router = APIRouter(prefix="/me", tags=["recovery"])


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
