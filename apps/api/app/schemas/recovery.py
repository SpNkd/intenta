from pydantic import BaseModel


class RecoveryCredentialResponse(BaseModel):
    code: str


class RecoveryAcknowledgementResponse(BaseModel):
    acknowledged: bool
