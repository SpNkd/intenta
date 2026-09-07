from fastapi import APIRouter, Response

from app.api.dependencies import CurrentAuth, Database
from app.schemas.intentions import ExperimentStepResponse
from app.services.intentions import next_step

router = APIRouter(prefix="/experiment", tags=["experiment"])


@router.get(
    "/next", response_model=ExperimentStepResponse | None, operation_id="getNextExperimentStep"
)
async def get_next_step(
    response: Response, db: Database, auth: CurrentAuth
) -> ExperimentStepResponse | None:
    step = await next_step(db, auth.user.id)
    response.headers["Cache-Control"] = "no-store"
    if step is None:
        return None
    return ExperimentStepResponse(
        id=step.id,
        position=step.position,
        amount_minor=step.amount_minor,
        currency=step.currency,
        reflection_after_days=step.reflection_after_days,
    )
