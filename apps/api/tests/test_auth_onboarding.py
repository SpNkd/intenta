import hashlib

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.api.v1.routes import auth as auth_routes
from app.core.config import get_settings
from app.core.database import SessionFactory
from app.main import app
from app.models import AnonymousUser, Session


@pytest.fixture(autouse=True)
def reset_rate_limiter() -> None:
    auth_routes.anonymous_rate_limiter = None


@pytest.mark.asyncio
async def test_anonymous_session_and_onboarding_flow() -> None:
    settings = get_settings()
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://127.0.0.1:3000",
    ) as client:
        created = await client.post("/api/v1/auth/anonymous")
        assert created.status_code == 201
        payload = created.json()
        user_id = payload["user"]["id"]
        assert payload["created"] is True
        assert payload["user"]["onboarding_completed"] is False
        assert "token" not in payload

        raw_cookie = client.cookies[settings.session_cookie_name]
        set_cookie = created.headers["set-cookie"]
        assert "HttpOnly" in set_cookie
        assert "SameSite=lax" in set_cookie

        me = await client.get("/api/v1/me")
        assert me.status_code == 200
        assert me.json()["id"] == user_id

        repeated = await client.post("/api/v1/auth/anonymous")
        assert repeated.status_code == 200
        assert repeated.json()["created"] is False
        assert repeated.json()["user"]["id"] == user_id

        csrf = await client.get("/api/v1/auth/csrf")
        assert csrf.status_code == 200
        csrf_token = csrf.json()["csrf_token"]

        rejected = await client.post("/api/v1/me/onboarding-completion")
        assert rejected.status_code == 403

        completed = await client.post(
            "/api/v1/me/onboarding-completion",
            headers={"Origin": "http://127.0.0.1:3000", "X-CSRF-Token": csrf_token},
        )
        assert completed.status_code == 200
        assert completed.json()["onboarding_completed"] is True

        completed_again = await client.post(
            "/api/v1/me/onboarding-completion",
            headers={"Origin": "http://127.0.0.1:3000", "X-CSRF-Token": csrf_token},
        )
        assert completed_again.status_code == 200

    async with SessionFactory() as db:
        stored_session = (
            await db.execute(select(Session).where(Session.user_id == user_id))
        ).scalar_one()
        assert stored_session.token_hash == hashlib.sha256(raw_cookie.encode()).digest()
        assert raw_cookie.encode() != stored_session.token_hash
        await db.execute(delete(AnonymousUser).where(AnonymousUser.id == user_id))
        await db.commit()


@pytest.mark.asyncio
async def test_current_user_requires_session() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://127.0.0.1:3000",
    ) as client:
        response = await client.get("/api/v1/me")

    assert response.status_code == 401
