import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.core.database import SessionFactory
from app.main import app
from app.models import AnonymousUser, RecoveryCredential

ORIGIN = "http://127.0.0.1:3000"


async def active_intention_client() -> tuple[AsyncClient, str, str]:
    client = AsyncClient(transport=ASGITransport(app=app), base_url=ORIGIN)
    created = await client.post("/api/v1/auth/anonymous")
    user_id = created.json()["user"]["id"]
    csrf = (await client.get("/api/v1/auth/csrf")).json()["csrf_token"]
    headers = {"Origin": ORIGIN, "X-CSRF-Token": csrf}
    await client.post("/api/v1/me/onboarding-completion", headers=headers)
    draft = await client.post(
        "/api/v1/intentions",
        json={"intention_text_raw": "Куплю себе хорошую книгу"},
        headers=headers,
    )
    await client.post(f"/api/v1/intentions/{draft.json()['id']}/activation", headers=headers)
    return client, user_id, csrf


@pytest.mark.asyncio
async def test_recovery_creates_new_session_for_same_user_and_keeps_old_session() -> None:
    owner, user_id, csrf = await active_intention_client()
    headers = {"Origin": ORIGIN, "X-CSRF-Token": csrf}
    recovered = AsyncClient(transport=ASGITransport(app=app), base_url=ORIGIN)
    repeated = AsyncClient(transport=ASGITransport(app=app), base_url=ORIGIN)
    try:
        issuance = await owner.post("/api/v1/me/recovery-credential", headers=headers)
        assert issuance.status_code == 200
        code = issuance.json()["code"]

        login = await recovered.post("/api/v1/auth/recover", json={"code": code})
        assert login.status_code == 200
        assert (await recovered.get("/api/v1/me")).json()["id"] == user_id
        assert (await recovered.get("/api/v1/me")).json()["flow_state"] == "active"
        assert (await owner.get("/api/v1/me")).json()["id"] == user_id

        reused = await repeated.post("/api/v1/auth/recover", json={"code": code})
        assert reused.status_code == 200
        assert (await repeated.get("/api/v1/me")).json()["id"] == user_id

        async with SessionFactory() as db:
            credential = await db.scalar(
                select(RecoveryCredential).where(RecoveryCredential.user_id == uuid.UUID(user_id))
            )
            assert credential is not None
            assert credential.last_used_at is not None
            assert code.rsplit("-", 1)[1] not in credential.secret_hash
    finally:
        await owner.aclose()
        await recovered.aclose()
        await repeated.aclose()
        async with SessionFactory() as db:
            await db.execute(delete(AnonymousUser).where(AnonymousUser.id == uuid.UUID(user_id)))
            await db.commit()


@pytest.mark.asyncio
async def test_invalid_and_unknown_recovery_codes_have_the_same_neutral_error() -> None:
    client = AsyncClient(transport=ASGITransport(app=app), base_url=ORIGIN)
    try:
        invalid_format = await client.post("/api/v1/auth/recover", json={"code": "wrong"})
        unknown_code = await client.post(
            "/api/v1/auth/recover",
            json={
                "code": "INTENTA-0000000000000000-000000000000000000000000000000000000000000000000"
            },
        )
        assert invalid_format.status_code == unknown_code.status_code == 401
        assert invalid_format.json() == unknown_code.json() == {"detail": "Invalid recovery code"}
    finally:
        await client.aclose()
