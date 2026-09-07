import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    onboarding_completed: bool
    flow_state: str


class AnonymousSessionResponse(BaseModel):
    user: MeResponse
    csrf_token: str
    created: bool


class CsrfResponse(BaseModel):
    csrf_token: str
