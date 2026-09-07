import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    onboarding_completed: bool
    flow_state: str
    credential_exists: bool
    recovery_code_acknowledged: bool


class AnonymousSessionResponse(BaseModel):
    user: MeResponse
    csrf_token: str
    created: bool


class CsrfResponse(BaseModel):
    csrf_token: str
