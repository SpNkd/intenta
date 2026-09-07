from typing import Annotated

from pydantic import BaseModel, Field


class RecoveryCredentialResponse(BaseModel):
    code: str


class RecoveryAcknowledgementResponse(BaseModel):
    acknowledged: bool


class RecoveryLoginRequest(BaseModel):
    code: Annotated[str, Field(max_length=128)]
