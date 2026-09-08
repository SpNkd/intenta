import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, update

from app.core.database import SessionFactory
from app.main import app
from app.models import AnonymousUser, ExperimentStep

ORIGIN = "http://127.0.0.1:3000"


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


async def create_and_complete(
    client: AsyncClient, headers: dict[str, str], text: str
) -> dict[str, object]:
    draft = await client.post(
        "/api/v1/intentions", json={"intention_text_raw": text}, headers=headers
    )
    assert draft.status_code == 201
    intention = draft.json()
    activated = await client.post(
        f"/api/v1/intentions/{intention['id']}/activation", headers=headers
    )
    assert activated.status_code == 200
    completed = await client.post(
        f"/api/v1/intentions/{intention['id']}/outcome",
        json=closure_payload(),
        headers=headers,
    )
    assert completed.status_code == 201
    return intention


@pytest.mark.asyncio
async def test_completion_makes_only_the_immediate_next_step_available() -> None:
    client, user_id, headers = await ready_client()
    try:
        initial_me = await client.get("/api/v1/me")
        assert initial_me.json()["flow_state"] == "ready_for_next"
        first = await client.get("/api/v1/experiment/next")
        assert first.json()["position"] == 1
        assert first.json()["amount_minor"] == 50000

        await create_and_complete(client, headers, "Куплю себе книгу")

        assert (await client.get("/api/v1/intentions/current")).json() is None
        assert (await client.get("/api/v1/me")).json()["flow_state"] == "ready_for_next"
        second = await client.get("/api/v1/experiment/next")
        assert second.json()["position"] == 2
        assert second.json()["amount_minor"] == 100000

        next_draft = await client.post(
            "/api/v1/intentions",
            json={"intention_text_raw": "Куплю себе альбом"},
            headers=headers,
        )
        assert next_draft.status_code == 201
        assert next_draft.json()["step_position"] == 2
        assert (await client.get("/api/v1/experiment/next")).json() is None
    finally:
        await client.aclose()
        async with SessionFactory() as db:
            await db.execute(delete(AnonymousUser).where(AnonymousUser.id == uuid.UUID(user_id)))
            await db.commit()


@pytest.mark.asyncio
async def test_last_step_completes_the_experiment_without_a_new_amount() -> None:
    client, user_id, headers = await ready_client()
    try:
        for position in range(1, 6):
            intention = await create_and_complete(client, headers, f"Моё намерение {position}")
            assert intention["step_position"] == position

        assert (await client.get("/api/v1/me")).json()["flow_state"] == "experiment_completed"
        assert (await client.get("/api/v1/experiment/next")).json() is None
        no_new_draft = await client.post(
            "/api/v1/intentions",
            json={"intention_text_raw": "Ещё одно намерение"},
            headers=headers,
        )
        assert no_new_draft.status_code == 409
    finally:
        await client.aclose()
        async with SessionFactory() as db:
            await db.execute(delete(AnonymousUser).where(AnonymousUser.id == uuid.UUID(user_id)))
            await db.commit()


@pytest.mark.asyncio
async def test_inactive_intermediate_step_is_not_silently_skipped() -> None:
    client, user_id, headers = await ready_client()
    try:
        await create_and_complete(client, headers, "Куплю себе книгу")
        async with SessionFactory() as db:
            await db.execute(
                update(ExperimentStep).where(ExperimentStep.position == 2).values(active=False)
            )
            await db.commit()
        try:
            next_step = await client.get("/api/v1/experiment/next")
            assert next_step.status_code == 409
            assert (await client.get("/api/v1/me")).json()[
                "flow_state"
            ] == "progression_unavailable"
        finally:
            async with SessionFactory() as db:
                await db.execute(
                    update(ExperimentStep).where(ExperimentStep.position == 2).values(active=True)
                )
                await db.commit()
    finally:
        await client.aclose()
        async with SessionFactory() as db:
            await db.execute(delete(AnonymousUser).where(AnonymousUser.id == uuid.UUID(user_id)))
            await db.commit()
