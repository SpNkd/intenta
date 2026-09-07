import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
