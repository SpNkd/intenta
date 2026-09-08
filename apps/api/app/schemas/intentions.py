import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TechniqueSnapshot(BaseModel):
    key: str
    version: int
    title: str
    instruction: str


class ExperimentStepResponse(BaseModel):
    id: uuid.UUID
    position: int
    amount_minor: int
    currency: str
    reflection_after_days: int


class IntentionInput(BaseModel):
    intention_text_raw: str = Field(min_length=3, max_length=500)

    @field_validator("intention_text_raw")
    @classmethod
    def trim_text(cls, value: str) -> str:
        trimmed = value.strip()
        if len(trimmed) < 3:
            raise ValueError("intention must contain at least 3 characters")
        return trimmed


class IntentionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    step_position: int
    amount_minor: int
    currency: str
    reflection_after_days: int
    intention_text_raw: str
    intention_statement: str
    statement_template_key: str
    statement_template_version: int
    technique: TechniqueSnapshot
    activated_at: datetime | None
    observation_day: int | None
    reflection_due: bool


class OutcomeInput(BaseModel):
    resolution: Literal["happened", "not_happened", "uncertain"]
    outcome_type: Literal["money", "other_amount", "opportunity", "similar", "other", "none"]
    source_type: (
        Literal[
            "gift",
            "refund",
            "bonus_or_cashback",
            "extra_income",
            "found_money",
            "saving_or_discount",
            "other",
        ]
        | None
    ) = None
    amount_received_minor: int | None = Field(default=None, ge=0)
    was_expected: Literal["yes", "no", "unsure", "not_applicable"]
    followed_original_intention: Literal[
        "yes", "not_yet", "chose_other", "did_not_spend", "not_applicable"
    ]
    user_note: str | None = Field(default=None, max_length=1000)
    occurred_at: datetime | None = None

    @field_validator("user_note")
    @classmethod
    def trim_note(cls, value: str | None) -> str | None:
        return value.strip() or None if value else None

    @model_validator(mode="after")
    def validate_resolution_fields(self) -> "OutcomeInput":
        if self.resolution == "happened":
            if self.outcome_type == "none":
                raise ValueError("a happened outcome requires an event type")
            if self.was_expected == "not_applicable":
                raise ValueError("a happened outcome requires expectedness")
            if self.followed_original_intention == "not_applicable":
                raise ValueError("a happened outcome requires spending response")
            return self
        if (
            self.outcome_type != "none"
            or self.source_type is not None
            or self.amount_received_minor is not None
            or self.was_expected != "not_applicable"
            or self.followed_original_intention != "not_applicable"
            or self.occurred_at is not None
        ):
            raise ValueError("a closure outcome may only include a note")
        return self


class OutcomeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    intention_id: uuid.UUID
    resolution: str
    outcome_type: str
    source_type: str | None
    amount_received_minor: int | None
    was_expected: str
    followed_original_intention: str
    user_note: str | None
    occurred_at: datetime | None
    created_at: datetime
