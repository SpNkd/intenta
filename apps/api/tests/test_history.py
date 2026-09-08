import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

from app.api.v1.routes import auth as auth_routes
from app.core.database import SessionFactory
from app.main import app
from app.models import AnonymousUser, Intention

ORIGIN = "http://127.0.0.1:3000"


@pytest.fixture(autouse=True)
def reset_anonymous_rate_limiter() -> None:
    auth_routes.anonymous_rate_limiter = None


def closure_payload() -> dict[str, object]:
    return {
        "resolution": "uncertain",
        "outcome_type": "none",
        "source_type": None,
        "amount_received_minor": None,
        "was_expected": "not_applicable",
        "followed_original_intention": "not_applicable",
        "user_note": None,
        "occurred_at": None,
    }


async def ready_client() -> tuple[AsyncClient, str, dict[str, str]]:
    client = AsyncClient(transport=ASGITransport(app=app), base_url=ORIGIN)
    user_id = (await client.post("/api/v1/auth/anonymous")).json()["user"]["id"]
    csrf = (await client.get("/api/v1/auth/csrf")).json()["csrf_token"]
    headers = {"Origin": ORIGIN, "X-CSRF-Token": csrf}
    await client.post("/api/v1/me/onboarding-completion", headers=headers)
    return client, user_id, headers


async def create_intention(
    client: AsyncClient, headers: dict[str, str], text: str
) -> dict[str, object]:
    response = await client.post(
        "/api/v1/intentions", json={"intention_text_raw": text}, headers=headers
    )
    assert response.status_code == 201
    return response.json()


async def complete_intention(
    client: AsyncClient, headers: dict[str, str], intention_id: str
) -> None:
    assert (
        await client.post(f"/api/v1/intentions/{intention_id}/activation", headers=headers)
    ).status_code == 200
    assert (
        await client.post(
            f"/api/v1/intentions/{intention_id}/outcome",
            json=closure_payload(),
            headers=headers,
        )
    ).status_code == 201


async def set_history_dates(intention_id: str, created_at: datetime) -> None:
    async with SessionFactory() as db:
        intention = await db.get(Intention, uuid.UUID(intention_id))
        assert intention is not None
        intention.created_at = created_at
        if intention.activated_at is not None:
            intention.activated_at = created_at + timedelta(hours=1)
            intention.completed_at = created_at + timedelta(days=3, hours=1)
        await db.commit()


@pytest.mark.asyncio
async def test_history_is_cursor_paginated_private_and_uses_saved_outcomes() -> None:
    owner, owner_id, headers = await ready_client()
    stranger, stranger_id, stranger_headers = await ready_client()
    start = datetime(2026, 9, 1, tzinfo=UTC)
    try:
        first = await create_intention(owner, headers, "Куплю себе книгу")
        await complete_intention(owner, headers, first["id"])
        second = await create_intention(owner, headers, "Куплю себе альбом")
        await complete_intention(owner, headers, second["id"])
        draft = await create_intention(owner, headers, "Куплю себе карандаши")
        await set_history_dates(first["id"], start)
        await set_history_dates(second["id"], start + timedelta(days=1))
        await set_history_dates(draft["id"], start + timedelta(days=2))

        first_page = await owner.get("/api/v1/intentions", params={"limit": 2})
        assert first_page.status_code == 200
        assert first_page.headers["cache-control"] == "no-store"
        first_data = first_page.json()
        assert [item["id"] for item in first_data["items"]] == [draft["id"], second["id"]]
        assert first_data["items"][0]["status"] == "draft"
        assert first_data["items"][0]["observation_days"] is None
        assert first_data["items"][1]["outcome_resolution"] == "uncertain"
        assert first_data["items"][1]["observation_days"] == 4
        assert "step_position" not in first_data["items"][1]
        assert first_data["next_cursor"]

        second_page = await owner.get(
            "/api/v1/intentions", params={"cursor": first_data["next_cursor"]}
        )
        assert [item["id"] for item in second_page.json()["items"]] == [first["id"]]
        assert second_page.json()["next_cursor"] is None
        assert (await owner.get("/api/v1/intentions", params={"cursor": "bad"})).status_code == 422

        assert (await stranger.get("/api/v1/intentions")).json()["items"] == []
        assert (await stranger.get(f"/api/v1/intentions/{first['id']}")).status_code == 404
        assert stranger_headers["X-CSRF-Token"]
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
