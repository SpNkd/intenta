import asyncio
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select

from app.core.database import SessionFactory
from app.main import app
from app.models import AnonymousUser, Intention, Outcome

ORIGIN = "http://127.0.0.1:3000"


async def active_client() -> tuple[AsyncClient, str, str, str]:
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
    return client, user_id, csrf, intention_id


def happened_payload() -> dict[str, object]:
    return {
        "resolution": "happened",
        "outcome_type": "money",
        "source_type": "gift",
        "amount_received_minor": 50000,
        "was_expected": "no",
        "followed_original_intention": "not_yet",
        "user_note": "  Неожиданный подарок.  ",
        "occurred_at": None,
    }


@pytest.mark.asyncio
async def test_happened_outcome_completes_active_intention_atomically() -> None:
    client, user_id, csrf, intention_id = await active_client()
    headers = {"Origin": ORIGIN, "X-CSRF-Token": csrf}
    try:
        created = await client.post(
            f"/api/v1/intentions/{intention_id}/outcome",
            json=happened_payload(),
            headers=headers,
        )
        assert created.status_code == 201
        assert created.headers["cache-control"] == "no-store"
        outcome = created.json()
        assert outcome["resolution"] == "happened"
        assert outcome["source_type"] == "gift"
        assert outcome["was_expected"] == "no"
        assert outcome["user_note"] == "Неожиданный подарок."
        assert (await client.get("/api/v1/intentions/current")).json() is None
        assert (await client.get(f"/api/v1/intentions/{intention_id}")).json()[
            "status"
        ] == "completed"
        assert (await client.get(f"/api/v1/intentions/{intention_id}/outcome")).json()[
            "id"
        ] == outcome["id"]
        assert (
            await client.post(
                f"/api/v1/intentions/{intention_id}/outcome",
                json=happened_payload(),
                headers=headers,
            )
        ).status_code == 409
        async with SessionFactory() as db:
            intention = await db.get(Intention, uuid.UUID(intention_id))
            assert intention is not None
            assert intention.status == "completed"
            assert intention.completed_at is not None
            assert (
                await db.scalar(
                    select(func.count())
                    .select_from(Outcome)
                    .where(Outcome.intention_id == intention.id)
                )
                == 1
            )
    finally:
        await client.aclose()
        async with SessionFactory() as db:
            await db.execute(delete(AnonymousUser).where(AnonymousUser.id == uuid.UUID(user_id)))
            await db.commit()


@pytest.mark.asyncio
@pytest.mark.parametrize("resolution", ["not_happened", "uncertain"])
async def test_neutral_closure_outcomes_are_valid(resolution: str) -> None:
    client, user_id, csrf, intention_id = await active_client()
    headers = {"Origin": ORIGIN, "X-CSRF-Token": csrf}
    try:
        response = await client.post(
            f"/api/v1/intentions/{intention_id}/outcome",
            json={
                "resolution": resolution,
                "outcome_type": "none",
                "source_type": None,
                "amount_received_minor": None,
                "was_expected": "not_applicable",
                "followed_original_intention": "not_applicable",
                "user_note": "Пока так.",
                "occurred_at": None,
            },
            headers=headers,
        )
        assert response.status_code == 201
        assert response.json()["resolution"] == resolution
        assert response.json()["outcome_type"] == "none"
    finally:
        await client.aclose()
        async with SessionFactory() as db:
            await db.execute(delete(AnonymousUser).where(AnonymousUser.id == uuid.UUID(user_id)))
            await db.commit()


@pytest.mark.asyncio
async def test_outcome_rejects_invalid_combinations_and_other_users() -> None:
    owner, owner_id, owner_csrf, intention_id = await active_client()
    stranger, stranger_id, stranger_csrf, _ = await active_client()
    try:
        invalid = await owner.post(
            f"/api/v1/intentions/{intention_id}/outcome",
            json={
                "resolution": "not_happened",
                "outcome_type": "money",
                "source_type": None,
                "amount_received_minor": None,
                "was_expected": "not_applicable",
                "followed_original_intention": "not_applicable",
                "user_note": None,
                "occurred_at": None,
            },
            headers={"Origin": ORIGIN, "X-CSRF-Token": owner_csrf},
        )
        assert invalid.status_code == 422
        assert (
            await stranger.post(
                f"/api/v1/intentions/{intention_id}/outcome",
                json=happened_payload(),
                headers={"Origin": ORIGIN, "X-CSRF-Token": stranger_csrf},
            )
        ).status_code == 404
        assert (await stranger.get(f"/api/v1/intentions/{intention_id}/outcome")).status_code == 404
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


@pytest.mark.asyncio
async def test_parallel_outcome_creation_completes_once() -> None:
    owner, user_id, csrf, intention_id = await active_client()
    contender = AsyncClient(transport=ASGITransport(app=app), base_url=ORIGIN)
    contender.cookies.update(owner.cookies)
    headers = {"Origin": ORIGIN, "X-CSRF-Token": csrf}
    try:
        responses = await asyncio.gather(
            owner.post(
                f"/api/v1/intentions/{intention_id}/outcome",
                json=happened_payload(),
                headers=headers,
            ),
            contender.post(
                f"/api/v1/intentions/{intention_id}/outcome",
                json=happened_payload(),
                headers=headers,
            ),
        )
        assert sorted(response.status_code for response in responses) == [201, 409]
    finally:
        await owner.aclose()
        await contender.aclose()
        async with SessionFactory() as db:
            await db.execute(delete(AnonymousUser).where(AnonymousUser.id == uuid.UUID(user_id)))
            await db.commit()
