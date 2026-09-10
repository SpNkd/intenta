from datetime import UTC, datetime

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.api.dependencies import CsrfProtectedAuth, CurrentAuth, Database
from app.models import Intention, RecoveryCredential
from app.schemas.auth import MeResponse
from app.services.auth import AuthContext
from app.services.intentions import get_flow_state

router = APIRouter(prefix="/me", tags=["current user"])


async def to_response(db: Database, auth: AuthContext) -> MeResponse:
    credential_exists = await db.scalar(
        select(RecoveryCredential.id).where(
            RecoveryCredential.user_id == auth.user.id,
            RecoveryCredential.disabled_at.is_(None),
        )
    )
    recovery_credential_issuable = await db.scalar(
        select(Intention.id)
        .where(
            Intention.user_id == auth.user.id,
            Intention.activated_at.is_not(None),
        )
        .limit(1)
    )
    return MeResponse(
        id=auth.user.id,
        created_at=auth.user.created_at,
        onboarding_completed=auth.user.onboarding_completed_at is not None,
        flow_state=await get_flow_state(db, auth.user),
        credential_exists=credential_exists is not None,
        recovery_credential_issuable=recovery_credential_issuable is not None,
        recovery_code_acknowledged=auth.user.recovery_code_acknowledged_at is not None,
    )


@router.get("", response_model=MeResponse, operation_id="getCurrentUser")
async def get_me(response: Response, db: Database, auth: CurrentAuth) -> MeResponse:
    response.headers["Cache-Control"] = "no-store"
    return await to_response(db, auth)


@router.post(
    "/onboarding-completion",
    response_model=MeResponse,
    operation_id="completeOnboarding",
)
async def complete_onboarding(
    response: Response,
    db: Database,
    auth: CsrfProtectedAuth,
) -> MeResponse:
    if auth.user.onboarding_completed_at is None:
        auth.user.onboarding_completed_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(auth.user)
    response.headers["Cache-Control"] = "no-store"
    return await to_response(db, auth)
