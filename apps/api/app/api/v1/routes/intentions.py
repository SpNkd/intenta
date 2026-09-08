import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select, update

from app.api.dependencies import CsrfProtectedAuth, CurrentAuth, Database
from app.core.clock import now_utc
from app.models import Intention, Outcome
from app.schemas.intentions import (
    IntentionInput,
    IntentionResponse,
    OutcomeInput,
    OutcomeResponse,
    TechniqueSnapshot,
)
from app.services.intentions import (
    build_statement,
    create_draft,
    create_outcome,
    defer_reflection,
    is_reflection_due,
)

router = APIRouter(prefix="/intentions", tags=["intentions"])


def to_response(intention: Intention, now: datetime | None = None) -> IntentionResponse:
    current_time = now or now_utc()
    observation_day = None
    if intention.activated_at is not None:
        observation_day = max(1, (current_time - intention.activated_at).days + 1)
    return IntentionResponse(
        id=intention.id,
        status=intention.status,
        step_position=intention.step_position,
        amount_minor=intention.amount_minor,
        currency=intention.currency,
        reflection_after_days=intention.reflection_after_days,
        intention_text_raw=intention.intention_text_raw,
        intention_statement=intention.intention_statement,
        statement_template_key=intention.statement_template_key,
        statement_template_version=intention.statement_template_version,
        technique=TechniqueSnapshot(
            key=intention.technique_key,
            version=intention.technique_version,
            title=intention.technique_title,
            instruction=intention.technique_instruction,
        ),
        activated_at=intention.activated_at,
        observation_day=observation_day,
        reflection_due=is_reflection_due(intention, current_time),
    )


def outcome_to_response(outcome: Outcome) -> OutcomeResponse:
    return OutcomeResponse.model_validate(outcome)


@router.get("/current", response_model=IntentionResponse | None, operation_id="getCurrentIntention")
async def get_current(
    response: Response, db: Database, auth: CurrentAuth
) -> IntentionResponse | None:
    intention = await db.scalar(
        select(Intention).where(
            Intention.user_id == auth.user.id,
            Intention.status.in_(("draft", "active")),
        )
    )
    response.headers["Cache-Control"] = "no-store"
    return to_response(intention) if intention else None


@router.get("/{intention_id}", response_model=IntentionResponse, operation_id="getIntention")
async def get_intention(
    intention_id: uuid.UUID, response: Response, db: Database, auth: CurrentAuth
) -> IntentionResponse:
    intention = await db.scalar(
        select(Intention).where(Intention.id == intention_id, Intention.user_id == auth.user.id)
    )
    if intention is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Intention not found")
    response.headers["Cache-Control"] = "no-store"
    return to_response(intention)


@router.post("", response_model=IntentionResponse, status_code=201, operation_id="createIntention")
async def create_intention(
    payload: IntentionInput, response: Response, db: Database, auth: CsrfProtectedAuth
) -> IntentionResponse:
    try:
        intention = await create_draft(db, auth.user, payload.intention_text_raw)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    await db.commit()
    await db.refresh(intention)
    response.headers["Cache-Control"] = "no-store"
    return to_response(intention)


@router.patch("/{intention_id}", response_model=IntentionResponse, operation_id="updateIntention")
async def update_intention(
    intention_id: uuid.UUID,
    payload: IntentionInput,
    response: Response,
    db: Database,
    auth: CsrfProtectedAuth,
) -> IntentionResponse:
    intention = await db.scalar(
        select(Intention).where(Intention.id == intention_id, Intention.user_id == auth.user.id)
    )
    if intention is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Intention not found")
    if intention.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Only a draft can be edited"
        )
    statement, key, version = build_statement(
        payload.intention_text_raw, intention.amount_minor, intention.currency
    )
    intention.intention_text_raw = payload.intention_text_raw
    intention.intention_statement = statement
    intention.statement_template_key = key
    intention.statement_template_version = version
    await db.commit()
    await db.refresh(intention)
    response.headers["Cache-Control"] = "no-store"
    return to_response(intention)


@router.post(
    "/{intention_id}/activation",
    response_model=IntentionResponse,
    operation_id="activateIntention",
)
async def activate_intention(
    intention_id: uuid.UUID, response: Response, db: Database, auth: CsrfProtectedAuth
) -> IntentionResponse:
    activated_at = now_utc()
    result = await db.execute(
        update(Intention)
        .where(
            Intention.id == intention_id,
            Intention.user_id == auth.user.id,
            Intention.status == "draft",
        )
        .values(status="active", activated_at=activated_at)
        .returning(Intention)
    )
    intention = result.scalar_one_or_none()
    if intention is None:
        existing = await db.scalar(
            select(Intention.id).where(
                Intention.id == intention_id, Intention.user_id == auth.user.id
            )
        )
        if existing is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Intention not found")
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Intention is not a draft")
    await db.commit()
    response.headers["Cache-Control"] = "no-store"
    return to_response(intention)


@router.post(
    "/{intention_id}/outcome",
    response_model=OutcomeResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        404: {"description": "Intention not found"},
        409: {"description": "Intention is not active"},
    },
    operation_id="createOutcome",
)
async def create_intention_outcome(
    intention_id: uuid.UUID,
    payload: OutcomeInput,
    response: Response,
    db: Database,
    auth: CsrfProtectedAuth,
) -> OutcomeResponse:
    try:
        outcome = await create_outcome(
            db,
            user_id=auth.user.id,
            intention_id=intention_id,
            payload=payload,
        )
    except LookupError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Intention not found"
        ) from error
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    await db.commit()
    await db.refresh(outcome)
    response.headers["Cache-Control"] = "no-store"
    return outcome_to_response(outcome)


@router.post(
    "/{intention_id}/reflection-deferral",
    response_model=IntentionResponse,
    responses={
        404: {"description": "Intention not found"},
        409: {"description": "Reflection is not due or Intention is not active"},
    },
    operation_id="deferIntentionReflection",
)
async def defer_intention_reflection(
    intention_id: uuid.UUID,
    response: Response,
    db: Database,
    auth: CsrfProtectedAuth,
) -> IntentionResponse:
    current_time = now_utc()
    try:
        intention = await defer_reflection(
            db,
            user_id=auth.user.id,
            intention_id=intention_id,
            now=current_time,
        )
    except LookupError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Intention not found"
        ) from error
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    await db.commit()
    await db.refresh(intention)
    response.headers["Cache-Control"] = "no-store"
    return to_response(intention, now=current_time)


@router.get(
    "/{intention_id}/outcome",
    response_model=OutcomeResponse,
    responses={404: {"description": "Outcome not found"}},
    operation_id="getOutcome",
)
async def get_intention_outcome(
    intention_id: uuid.UUID,
    response: Response,
    db: Database,
    auth: CurrentAuth,
) -> OutcomeResponse:
    outcome = await db.scalar(
        select(Outcome)
        .join(Intention, Outcome.intention_id == Intention.id)
        .where(Intention.id == intention_id, Intention.user_id == auth.user.id)
    )
    if outcome is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Outcome not found")
    response.headers["Cache-Control"] = "no-store"
    return outcome_to_response(outcome)
