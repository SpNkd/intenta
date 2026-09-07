from datetime import UTC, datetime

from fastapi import APIRouter, Response

from app.api.dependencies import CsrfProtectedAuth, CurrentAuth, Database
from app.schemas.auth import MeResponse
from app.services.auth import AuthContext
from app.services.intentions import get_flow_state

router = APIRouter(prefix="/me", tags=["current user"])


async def to_response(db: Database, auth: AuthContext) -> MeResponse:
    return MeResponse(
        id=auth.user.id,
        created_at=auth.user.created_at,
        onboarding_completed=auth.user.onboarding_completed_at is not None,
        flow_state=await get_flow_state(db, auth.user),
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
