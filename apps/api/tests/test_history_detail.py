import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.api.v1.routes import auth as auth_routes
from app.core.database import SessionFactory
from app.main import app
from app.models import AnonymousUser, Technique

ORIGIN = "http://127.0.0.1:3000"


@pytest.fixture(autouse=True)
def reset_anonymous_rate_limiter() -> None:
    auth_routes.anonymous_rate_limiter = None


async def active_client() -> tuple[AsyncClient, str, dict[str, str], str]:
    client = AsyncClient(transport=ASGITransport(app=app), base_url=ORIGIN)
    user_id = (await client.post("/api/v1/auth/anonymous")).json()["user"]["id"]
    csrf = (await client.get("/api/v1/auth/csrf")).json()["csrf_token"]
    headers = {"Origin": ORIGIN, "X-CSRF-Token": csrf}
    await client.post("/api/v1/me/onboarding-completion", headers=headers)
    draft = await client.post(
        "/api/v1/intentions",
        json={"intention_text_raw": "Куплю себе хорошие наушники"},
        headers=headers,
    )
    intention_id = draft.json()["id"]
    await client.post(f"/api/v1/intentions/{intention_id}/activation", headers=headers)
    return client, user_id, headers, intention_id


@pytest.mark.asyncio
async def test_history_detail_returns_immutable_snapshots_and_private_outcome() -> None:
    owner, owner_id, headers, intention_id = await active_client()
    stranger = AsyncClient(transport=ASGITransport(app=app), base_url=ORIGIN)
    stranger_id = (await stranger.post("/api/v1/auth/anonymous")).json()["user"]["id"]
    try:
        completed = await owner.post(
            f"/api/v1/intentions/{intention_id}/outcome",
            json={
                "resolution": "happened",
                "outcome_type": "money",
                "source_type": "gift",
                "amount_received_minor": 50000,
                "was_expected": "no",
                "followed_original_intention": "not_yet",
                "user_note": "Неожиданный подарок.",
                "occurred_at": None,
            },
            headers=headers,
        )
        assert completed.status_code == 201
        async with SessionFactory() as db:
            technique = await db.scalar(select(Technique).limit(1))
            assert technique is not None
            await db.execute(
                Technique.__table__.update()
                .where(Technique.id == technique.id)
                .values(title="Изменённая текущая техника")
            )
            await db.commit()
        try:
            detail = await owner.get(f"/api/v1/intentions/{intention_id}")
            assert detail.status_code == 200
            data = detail.json()
            assert data["intention_text_raw"] == "Куплю себе хорошие наушники"
            assert "Это моё намерение." in data["intention_statement"]
            assert data["technique"]["title"] == "Остановись на минуту"
            assert data["activated_at"] is not None
            assert data["completed_at"] is not None
            assert data["observation_days"] is not None
            assert data["reflection_due"] is False

            outcome = await owner.get(f"/api/v1/intentions/{intention_id}/outcome")
            assert outcome.status_code == 200
            assert outcome.json()["source_type"] == "gift"
            assert outcome.json()["user_note"] == "Неожиданный подарок."
            assert (await stranger.get(f"/api/v1/intentions/{intention_id}")).status_code == 404
            assert (
                await stranger.get(f"/api/v1/intentions/{intention_id}/outcome")
            ).status_code == 404
        finally:
            async with SessionFactory() as db:
                await db.execute(
                    Technique.__table__.update()
                    .where(Technique.key == "handwritten_pause")
                    .values(title="Остановись на минуту")
                )
                await db.commit()
    finally:
        await owner.aclose()
        await stranger.aclose()
        async with SessionFactory() as db:
            await db.execute(
                delete(AnonymousUser).where(
                    AnonymousUser.id.in_((uuid.UUID(owner_id), uuid.UUID(stranger_id)))
                )
            )
            await db.commit()
