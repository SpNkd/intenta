import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class MeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    onboarding_completed: bool
    flow_state: Literal[
        "onboarding",
        "paper",
        "active",
        "ready_for_next",
        "experiment_completed",
        "progression_unavailable",
    ]
    credential_exists: bool
    recovery_credential_issuable: bool
    recovery_code_acknowledged: bool


class AnonymousSessionResponse(BaseModel):
    user: MeResponse
    csrf_token: str
    created: bool


class CsrfResponse(BaseModel):
    csrf_token: str
