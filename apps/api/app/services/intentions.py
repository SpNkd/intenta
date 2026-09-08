import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import now_utc
from app.core.content import load_content_catalog
from app.models import AnonymousUser, ExperimentStep, Intention, Outcome, Technique
from app.schemas.intentions import OutcomeInput


class ProgressionConfigurationError(Exception):
    """The configured experiment ladder has a gap or an inactive next step."""


async def get_flow_state(db: AsyncSession, user: AnonymousUser) -> str:
    if user.onboarding_completed_at is None:
        return "onboarding"
    current_status = await db.scalar(
        select(Intention.status).where(
            Intention.user_id == user.id,
            Intention.status.in_(("draft", "active")),
        )
    )
    if current_status == "draft":
        return "paper"
    if current_status == "active":
        return "active"
    try:
        step = await next_step(db, user.id)
    except ProgressionConfigurationError:
        return "progression_unavailable"
    return "ready_for_next" if step is not None else "experiment_completed"


def format_amount(amount_minor: int, currency: str) -> str:
    amount = amount_minor // 100
    symbol = "₽" if currency == "RUB" else currency
    return f"{amount:,}".replace(",", " ") + f" {symbol}"


def build_statement(text: str, amount_minor: int, currency: str) -> tuple[str, str, int]:
    catalog = load_content_catalog()
    template = catalog.get_text("intentions", "statement_template")
    key = catalog.get_text("intentions", "statement_template_key")
    version = int(catalog.get_text("intentions", "statement_template_version"))
    statement = template.format(amount=format_amount(amount_minor, currency), intention_text=text)
    return statement, key, version


async def next_step(db: AsyncSession, user_id: uuid.UUID) -> ExperimentStep | None:
    current = await db.scalar(
        select(Intention.id).where(
            Intention.user_id == user_id, Intention.status.in_(("draft", "active"))
        )
    )
    if current is not None:
        return None
    last_completed_position = await db.scalar(
        select(func.max(Intention.step_position)).where(
            Intention.user_id == user_id,
            Intention.status == "completed",
        )
    )
    expected_position = (last_completed_position or 0) + 1
    step = await db.scalar(
        select(ExperimentStep).where(ExperimentStep.position == expected_position)
    )
    if step is not None:
        if not step.active:
            raise ProgressionConfigurationError
        return step

    last_configured_position = await db.scalar(select(func.max(ExperimentStep.position)))
    if last_configured_position is None or expected_position > last_configured_position:
        return None
    raise ProgressionConfigurationError


async def create_draft(db: AsyncSession, user: AnonymousUser, text: str) -> Intention:
    await db.execute(select(AnonymousUser.id).where(AnonymousUser.id == user.id).with_for_update())
    current = await db.scalar(
        select(Intention).where(
            Intention.user_id == user.id, Intention.status.in_(("draft", "active"))
        )
    )
    if current is not None:
        return current
    step = await next_step(db, user.id)
    if step is None:
        raise ValueError("no experiment step is available")
    technique = await db.get(Technique, step.technique_id)
    if technique is None or not technique.active:
        raise ValueError("configured technique is unavailable")
    statement, template_key, template_version = build_statement(
        text, step.amount_minor, step.currency
    )
    intention = Intention(
        user_id=user.id,
        experiment_step_id=step.id,
        step_position=step.position,
        amount_minor=step.amount_minor,
        currency=step.currency,
        reflection_after_days=step.reflection_after_days,
        intention_text_raw=text,
        intention_statement=statement,
        statement_template_key=template_key,
        statement_template_version=template_version,
        technique_id=technique.id,
        technique_key=technique.key,
        technique_version=technique.version,
        technique_title=technique.title,
        technique_instruction=technique.instruction,
        status="draft",
    )
    db.add(intention)
    await db.flush()
    return intention


async def create_outcome(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    intention_id: uuid.UUID,
    payload: OutcomeInput,
) -> Outcome:
    intention = await db.scalar(
        select(Intention)
        .where(Intention.id == intention_id, Intention.user_id == user_id)
        .with_for_update()
    )
    if intention is None:
        raise LookupError
    if intention.status != "active":
        raise ValueError("only an active Intention can be completed")
    outcome = Outcome(
        intention_id=intention.id,
        resolution=payload.resolution,
        outcome_type=payload.outcome_type,
        source_type=payload.source_type,
        amount_received_minor=payload.amount_received_minor,
        was_expected=payload.was_expected,
        followed_original_intention=payload.followed_original_intention,
        user_note=payload.user_note,
        occurred_at=payload.occurred_at,
    )
    intention.status = "completed"
    intention.completed_at = now_utc()
    db.add(outcome)
    await db.flush()
    return outcome
