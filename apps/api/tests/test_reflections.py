import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

from app.api.v1.routes import auth as auth_routes
from app.api.v1.routes import intentions as intention_routes
from app.core.database import SessionFactory
from app.main import app
from app.models import AnonymousUser, Intention

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
        json={"intention_text_raw": "Куплю себе хорошую книгу"},
        headers=headers,
    )
    intention_id = draft.json()["id"]
    await client.post(f"/api/v1/intentions/{intention_id}/activation", headers=headers)
    return client, user_id, headers, intention_id


async def set_activated_at(intention_id: str, activated_at: datetime) -> None:
    async with SessionFactory() as db:
        intention = await db.get(Intention, uuid.UUID(intention_id))
        assert intention is not None
        intention.activated_at = activated_at
        intention.reflection_deferred_until = None
        await db.commit()


@pytest.mark.asyncio
async def test_reflection_due_uses_utc_boundary_and_deferral_keeps_intention_active(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, user_id, headers, intention_id = await active_client()
    clock = datetime(2026, 9, 8, 12, 0, tzinfo=UTC)
    monkeypatch.setattr(intention_routes, "now_utc", lambda: clock)
    try:
        await set_activated_at(intention_id, clock - timedelta(days=7) + timedelta(microseconds=1))
        before_boundary = await client.get("/api/v1/intentions/current")
        assert before_boundary.json()["reflection_due"] is False

        await set_activated_at(intention_id, clock - timedelta(days=7))
        due = await client.get("/api/v1/intentions/current")
        assert due.json()["reflection_due"] is True

        deferred = await client.post(
            f"/api/v1/intentions/{intention_id}/reflection-deferral", headers=headers
        )
        assert deferred.status_code == 200
        assert deferred.headers["cache-control"] == "no-store"
        assert deferred.json()["status"] == "active"
        assert deferred.json()["reflection_due"] is False
        async with SessionFactory() as db:
            intention = await db.get(Intention, uuid.UUID(intention_id))
            assert intention is not None
            assert intention.reflection_deferred_until == clock + timedelta(days=7)
            assert intention.status == "active"
    finally:
        await client.aclose()
        async with SessionFactory() as db:
            await db.execute(delete(AnonymousUser).where(AnonymousUser.id == uuid.UUID(user_id)))
            await db.commit()


@pytest.mark.asyncio
async def test_completed_intention_cannot_be_deferred_or_be_due(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, user_id, headers, intention_id = await active_client()
    clock = datetime(2026, 9, 8, 12, 0, tzinfo=UTC)
    monkeypatch.setattr(intention_routes, "now_utc", lambda: clock)
    try:
        await set_activated_at(intention_id, clock - timedelta(days=8))
        completed = await client.post(
            f"/api/v1/intentions/{intention_id}/outcome",
            json={
                "resolution": "uncertain",
                "outcome_type": "none",
                "source_type": None,
                "amount_received_minor": None,
                "was_expected": "not_applicable",
                "followed_original_intention": "not_applicable",
                "user_note": None,
                "occurred_at": None,
            },
            headers=headers,
        )
        assert completed.status_code == 201
        detail = await client.get(f"/api/v1/intentions/{intention_id}")
        assert detail.json()["status"] == "completed"
        assert detail.json()["reflection_due"] is False
        assert (
            await client.post(
                f"/api/v1/intentions/{intention_id}/reflection-deferral", headers=headers
            )
        ).status_code == 409
    finally:
        await client.aclose()
        async with SessionFactory() as db:
            await db.execute(delete(AnonymousUser).where(AnonymousUser.id == uuid.UUID(user_id)))
            await db.commit()
