import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select

from app.core.database import SessionFactory
from app.main import app
from app.models import AnonymousUser, Intention, Technique

ORIGIN = "http://127.0.0.1:3000"


async def onboarded_client() -> tuple[AsyncClient, str, str]:
    client = AsyncClient(transport=ASGITransport(app=app), base_url=ORIGIN)
    created = await client.post("/api/v1/auth/anonymous")
    user_id = created.json()["user"]["id"]
    csrf = (await client.get("/api/v1/auth/csrf")).json()["csrf_token"]
    headers = {"Origin": ORIGIN, "X-CSRF-Token": csrf}
    await client.post("/api/v1/me/onboarding-completion", headers=headers)
    return client, user_id, csrf


@pytest.mark.asyncio
async def test_next_step_create_trim_statement_snapshot_edit_and_repeat() -> None:
    client, user_id, csrf = await onboarded_client()
    headers = {"Origin": ORIGIN, "X-CSRF-Token": csrf}
    try:
        step = await client.get("/api/v1/experiment/next")
        assert step.status_code == 200
        assert step.json()["amount_minor"] == 50000
        assert step.json()["currency"] == "RUB"

        invalid = await client.post(
            "/api/v1/intentions",
            json={"intention_text_raw": "  "},
            headers=headers,
        )
        assert invalid.status_code == 422

        created = await client.post(
            "/api/v1/intentions",
            json={"intention_text_raw": "  Куплю себе хорошие наушники.  "},
            headers=headers,
        )
        assert created.status_code == 201
        draft = created.json()
        assert draft["intention_text_raw"] == "Куплю себе хорошие наушники."
        assert draft["intention_statement"] == (
            "Если в моей жизни неожиданно появятся 500 ₽,\n"
            "я потрачу их на то, что выбрал для себя:\n\n"
            "«Куплю себе хорошие наушники.»\n\nЭто моё намерение."
        )
        assert draft["statement_template_key"] == "intention_statement"
        assert draft["statement_template_version"] == 1
        assert draft["technique"]["key"] == "handwritten_pause"
        assert draft["technique"]["version"] == 1

        repeated = await client.post(
            "/api/v1/intentions",
            json={"intention_text_raw": "Другой повторный текст"},
            headers=headers,
        )
        assert repeated.json()["id"] == draft["id"]

        updated = await client.patch(
            f"/api/v1/intentions/{draft['id']}",
            json={"intention_text_raw": "  Куплю себе книгу  "},
            headers=headers,
        )
        assert updated.status_code == 200
        assert updated.json()["intention_text_raw"] == "Куплю себе книгу"
        assert "«Куплю себе книгу»" in updated.json()["intention_statement"]

        async with SessionFactory() as db:
            technique = await db.scalar(
                select(Technique).where(Technique.key == "handwritten_pause")
            )
            assert technique is not None
            original_title = technique.title
            technique.title = "Новый заголовок для будущих drafts"
            await db.commit()
        current = await client.get("/api/v1/intentions/current")
        assert current.json()["technique"]["title"] == "Остановись на минуту"
        async with SessionFactory() as db:
            technique = await db.scalar(
                select(Technique).where(Technique.key == "handwritten_pause")
            )
            assert technique is not None
            technique.title = original_title
            count = await db.scalar(
                select(func.count())
                .select_from(Intention)
                .where(Intention.user_id == uuid.UUID(user_id))
            )
            assert count == 1
            await db.commit()
    finally:
        await client.aclose()
        async with SessionFactory() as db:
            await db.execute(delete(AnonymousUser).where(AnonymousUser.id == uuid.UUID(user_id)))
            await db.commit()


@pytest.mark.asyncio
async def test_cannot_read_or_edit_another_users_draft() -> None:
    owner, owner_id, owner_csrf = await onboarded_client()
    stranger, stranger_id, stranger_csrf = await onboarded_client()
    try:
        created = await owner.post(
            "/api/v1/intentions",
            json={"intention_text_raw": "Куплю себе хорошие наушники"},
            headers={"Origin": ORIGIN, "X-CSRF-Token": owner_csrf},
        )
        intention_id = created.json()["id"]
        assert (await stranger.get(f"/api/v1/intentions/{intention_id}")).status_code == 404
        edited = await stranger.patch(
            f"/api/v1/intentions/{intention_id}",
            json={"intention_text_raw": "Чужой текст"},
            headers={"Origin": ORIGIN, "X-CSRF-Token": stranger_csrf},
        )
        assert edited.status_code == 404
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
async def test_activation_is_atomic_immutable_and_updates_flow_state() -> None:
    client, user_id, csrf = await onboarded_client()
    headers = {"Origin": ORIGIN, "X-CSRF-Token": csrf}
    try:
        draft = await client.post(
            "/api/v1/intentions",
            json={"intention_text_raw": "Куплю себе хорошую книгу"},
            headers=headers,
        )
        intention_id = draft.json()["id"]
        activated = await client.post(
            f"/api/v1/intentions/{intention_id}/activation", headers=headers
        )
        assert activated.status_code == 200
        assert activated.json()["status"] == "active"
        assert activated.json()["activated_at"] is not None
        assert activated.json()["observation_day"] == 1
        assert (await client.get("/api/v1/me")).json()["flow_state"] == "active"
        assert (await client.get("/api/v1/intentions/current")).json()["id"] == intention_id
        assert (
            await client.post(f"/api/v1/intentions/{intention_id}/activation", headers=headers)
        ).status_code == 409
        assert (
            await client.patch(
                f"/api/v1/intentions/{intention_id}",
                json={"intention_text_raw": "Попытка изменить active"},
                headers=headers,
            )
        ).status_code == 409
        assert (
            await client.post(
                "/api/v1/intentions",
                json={"intention_text_raw": "Второй draft"},
                headers=headers,
            )
        ).json()["id"] == intention_id
    finally:
        await client.aclose()
        async with SessionFactory() as db:
            await db.execute(delete(AnonymousUser).where(AnonymousUser.id == uuid.UUID(user_id)))
            await db.commit()
