from pydantic import BaseModel


class RecoveryCredentialResponse(BaseModel):
    code: str


class RecoveryAcknowledgementResponse(BaseModel):
    acknowledged: bool


class RecoveryLoginRequest(BaseModel):
    code: str
