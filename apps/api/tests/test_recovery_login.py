import asyncio
import re
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select

from app.api.v1.routes import auth as auth_routes
from app.api.v1.routes import recovery as recovery_routes
from app.core.database import SessionFactory
from app.main import app
from app.models import AnonymousUser, RateLimitBucket, RecoveryCredential
from app.services import recovery as recovery_service

ORIGIN = "http://127.0.0.1:3000"


@pytest.fixture(autouse=True)
async def reset_recovery_rate_limiters():
    auth_routes.anonymous_rate_limiter = None
    async with SessionFactory() as db:
        await db.execute(delete(RateLimitBucket))
        await db.commit()
    yield
    async with SessionFactory() as db:
        await db.execute(delete(RateLimitBucket))
        await db.commit()


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
        assert issuance.headers["cache-control"] == "no-store"
        code = issuance.json()["code"]
        assert re.fullmatch(r"INTENTA-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{20}", code)

        _, public_id, secret = code.split("-")
        different_secret = ("0" if secret[0] != "0" else "1") + secret[1:]
        wrong_secret = await recovered.post(
            "/api/v1/auth/recover",
            json={"code": f"INTENTA-{public_id}-{different_secret}"},
        )
        assert wrong_secret.status_code == 401
        assert wrong_secret.json() == {"detail": "Invalid recovery code"}

        login = await recovered.post("/api/v1/auth/recover", json={"code": code})
        assert login.status_code == 204
        assert login.headers["cache-control"] == "no-store"
        assert (await recovered.get("/api/v1/me")).json()["id"] == user_id
        assert (await recovered.get("/api/v1/me")).json()["flow_state"] == "active"
        assert (await owner.get("/api/v1/me")).json()["id"] == user_id

        reused = await repeated.post("/api/v1/auth/recover", json={"code": code})
        assert reused.status_code == 204
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
            json={"code": "INTENTA-ABCDEFGH-00000000000000000000"},
        )
        assert invalid_format.status_code == unknown_code.status_code == 401
        assert invalid_format.json() == unknown_code.json() == {"detail": "Invalid recovery code"}
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_replacement_disables_old_code_and_preserves_sessions() -> None:
    owner, user_id, csrf = await active_intention_client()
    headers = {"Origin": ORIGIN, "X-CSRF-Token": csrf}
    old_login = AsyncClient(transport=ASGITransport(app=app), base_url=ORIGIN)
    new_login = AsyncClient(transport=ASGITransport(app=app), base_url=ORIGIN)
    try:
        issued = await owner.post("/api/v1/me/recovery-credential", headers=headers)
        old_code = issued.json()["code"]
        acknowledged = await owner.post("/api/v1/me/recovery-code-acknowledgement", headers=headers)
        assert acknowledged.status_code == 200

        replacement = await owner.post(
            "/api/v1/me/recovery-credential/replacement", headers=headers
        )
        assert replacement.status_code == 200
        new_code = replacement.json()["code"]
        assert new_code != old_code
        me = await owner.get("/api/v1/me")
        assert me.json()["credential_exists"] is True
        assert me.json()["recovery_code_acknowledged"] is False

        assert (
            await old_login.post("/api/v1/auth/recover", json={"code": old_code})
        ).status_code == 401
        assert (
            await new_login.post("/api/v1/auth/recover", json={"code": new_code})
        ).status_code == 204
        assert (await new_login.get("/api/v1/me")).json()["id"] == user_id
        assert (await new_login.get("/api/v1/me")).json()["flow_state"] == "active"
        assert (await owner.get("/api/v1/me")).json()["id"] == user_id

        async with SessionFactory() as db:
            credentials = list(
                (
                    await db.scalars(
                        select(RecoveryCredential)
                        .where(RecoveryCredential.user_id == uuid.UUID(user_id))
                        .order_by(RecoveryCredential.created_at)
                    )
                ).all()
            )
            assert len(credentials) == 2
            assert credentials[0].disabled_at is not None
            assert credentials[1].disabled_at is None
            assert old_code.rsplit("-", 1)[1] not in credentials[0].secret_hash
            assert new_code.rsplit("-", 1)[1] not in credentials[1].secret_hash
    finally:
        await owner.aclose()
        await old_login.aclose()
        await new_login.aclose()
        async with SessionFactory() as db:
            await db.execute(delete(AnonymousUser).where(AnonymousUser.id == uuid.UUID(user_id)))
            await db.commit()


@pytest.mark.asyncio
async def test_recovery_cannot_create_a_session_for_a_credential_replaced_mid_login(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner, user_id, csrf = await active_intention_client()
    recovered = AsyncClient(transport=ASGITransport(app=app), base_url=ORIGIN)
    headers = {"Origin": ORIGIN, "X-CSRF-Token": csrf}
    verified = asyncio.Event()
    original_hasher = recovery_service.hasher

    loop = asyncio.get_running_loop()

    class SignalingHasher:
        def hash(self, secret: str) -> str:
            return original_hasher.hash(secret)

        def verify(self, encoded_hash: str, secret: str) -> bool:
            loop.call_soon_threadsafe(verified.set)
            return original_hasher.verify(encoded_hash, secret)

    try:
        issued = await owner.post("/api/v1/me/recovery-credential", headers=headers)
        old_code = issued.json()["code"]
        monkeypatch.setattr(recovery_service, "hasher", SignalingHasher())
        async with SessionFactory() as replacement_db:
            new_code = await recovery_service.replace_credential(replacement_db, uuid.UUID(user_id))
            stale_recovery = asyncio.create_task(
                recovered.post("/api/v1/auth/recover", json={"code": old_code})
            )
            await asyncio.wait_for(verified.wait(), timeout=3)
            await replacement_db.commit()

        assert (await stale_recovery).status_code == 401
        assert (
            await recovered.post("/api/v1/auth/recover", json={"code": new_code})
        ).status_code == 204
    finally:
        await owner.aclose()
        await recovered.aclose()
        async with SessionFactory() as db:
            await db.execute(delete(AnonymousUser).where(AnonymousUser.id == uuid.UUID(user_id)))
            await db.commit()


@pytest.mark.asyncio
async def test_credential_can_be_issued_after_a_completed_intention() -> None:
    owner, user_id, csrf = await active_intention_client()
    headers = {"Origin": ORIGIN, "X-CSRF-Token": csrf}
    try:
        current = await owner.get("/api/v1/intentions/current")
        completed = await owner.post(
            f"/api/v1/intentions/{current.json()['id']}/outcome",
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
        assert (await owner.get("/api/v1/me")).json()["flow_state"] == "ready_for_next"
        assert (
            await owner.post("/api/v1/me/recovery-credential", headers=headers)
        ).status_code == 200
    finally:
        await owner.aclose()
        async with SessionFactory() as db:
            await db.execute(delete(AnonymousUser).where(AnonymousUser.id == uuid.UUID(user_id)))
            await db.commit()


@pytest.mark.asyncio
async def test_issuance_and_replacement_require_csrf_and_allowed_origin() -> None:
    owner, user_id, csrf = await active_intention_client()
    try:
        assert (await owner.post("/api/v1/me/recovery-credential")).status_code == 403
        wrong_origin = await owner.post(
            "/api/v1/me/recovery-credential",
            headers={"Origin": "https://attacker.example", "X-CSRF-Token": csrf},
        )
        assert wrong_origin.status_code == 403

        issued = await owner.post(
            "/api/v1/me/recovery-credential",
            headers={"Origin": ORIGIN, "X-CSRF-Token": csrf},
        )
        assert issued.status_code == 200
        assert issued.headers["cache-control"] == "no-store"

        assert (await owner.post("/api/v1/me/recovery-credential/replacement")).status_code == 403
        replacement_wrong_origin = await owner.post(
            "/api/v1/me/recovery-credential/replacement",
            headers={"Origin": "https://attacker.example", "X-CSRF-Token": csrf},
        )
        assert replacement_wrong_origin.status_code == 403
        replacement = await owner.post(
            "/api/v1/me/recovery-credential/replacement",
            headers={"Origin": ORIGIN, "X-CSRF-Token": csrf},
        )
        assert replacement.status_code == 200
        assert replacement.headers["cache-control"] == "no-store"
    finally:
        await owner.aclose()
        async with SessionFactory() as db:
            await db.execute(delete(AnonymousUser).where(AnonymousUser.id == uuid.UUID(user_id)))
            await db.commit()


@pytest.mark.asyncio
async def test_parallel_initial_issuance_returns_one_code_and_one_conflict() -> None:
    owner, user_id, csrf = await active_intention_client()
    contender = AsyncClient(transport=ASGITransport(app=app), base_url=ORIGIN)
    contender.cookies.update(owner.cookies)
    headers = {"Origin": ORIGIN, "X-CSRF-Token": csrf}
    try:
        responses = await asyncio.gather(
            owner.post("/api/v1/me/recovery-credential", headers=headers),
            contender.post("/api/v1/me/recovery-credential", headers=headers),
        )
        assert sorted(response.status_code for response in responses) == [200, 409]
        async with SessionFactory() as db:
            active_count = await db.scalar(
                select(func.count())
                .select_from(RecoveryCredential)
                .where(
                    RecoveryCredential.user_id == uuid.UUID(user_id),
                    RecoveryCredential.disabled_at.is_(None),
                )
            )
            assert active_count == 1
    finally:
        await owner.aclose()
        await contender.aclose()
        async with SessionFactory() as db:
            await db.execute(delete(AnonymousUser).where(AnonymousUser.id == uuid.UUID(user_id)))
            await db.commit()


@pytest.mark.asyncio
async def test_public_id_collision_is_retried(monkeypatch) -> None:
    first, first_user_id, first_csrf = await active_intention_client()
    second, second_user_id, second_csrf = await active_intention_client()
    try:
        first_issuance = await first.post(
            "/api/v1/me/recovery-credential",
            headers={"Origin": ORIGIN, "X-CSRF-Token": first_csrf},
        )
        collision_public_id = first_issuance.json()["code"].split("-")[1]
        generated_parts = iter(
            (
                (collision_public_id, "00000000000000000000"),
                ("ZZZZZZZZ", "11111111111111111111"),
            )
        )
        monkeypatch.setattr(
            recovery_service, "generate_recovery_parts", lambda: next(generated_parts)
        )

        issuance = await second.post(
            "/api/v1/me/recovery-credential",
            headers={"Origin": ORIGIN, "X-CSRF-Token": second_csrf},
        )
        assert issuance.status_code == 200
        assert issuance.json()["code"] == "INTENTA-ZZZZZZZZ-11111111111111111111"
    finally:
        await first.aclose()
        await second.aclose()
        async with SessionFactory() as db:
            await db.execute(
                delete(AnonymousUser).where(
                    AnonymousUser.id.in_((uuid.UUID(first_user_id), uuid.UUID(second_user_id)))
                )
            )
            await db.commit()


@pytest.mark.asyncio
async def test_recovery_has_general_and_hmac_scoped_rate_limits() -> None:
    clients: list[AsyncClient] = []
    try:
        for index in range(10):
            client = AsyncClient(
                transport=ASGITransport(app=app, client=("198.51.100.10", 4000 + index)),
                base_url=ORIGIN,
            )
            clients.append(client)
            public_id = recovery_service._encode_crockford(index, 8)
            response = await client.post(
                "/api/v1/auth/recover",
                json={"code": f"INTENTA-{public_id}-00000000000000000000"},
            )
            assert response.status_code == 401
        general_limited = await clients[0].post(
            "/api/v1/auth/recover",
            json={"code": "INTENTA-ZZZZZZZZ-00000000000000000000"},
        )
        assert general_limited.status_code == 429

        async with SessionFactory() as db:
            await db.execute(delete(RateLimitBucket))
            await db.commit()
        scoped_code = "INTENTA-ABCDEFGH-00000000000000000000"
        for index in range(5):
            client = AsyncClient(
                transport=ASGITransport(app=app, client=(f"203.0.113.{index + 1}", 5000)),
                base_url=ORIGIN,
            )
            clients.append(client)
            assert (
                await client.post("/api/v1/auth/recover", json={"code": scoped_code})
            ).status_code == 401
        scoped_client = AsyncClient(
            transport=ASGITransport(app=app, client=("203.0.113.99", 5000)),
            base_url=ORIGIN,
        )
        clients.append(scoped_client)
        assert (
            await scoped_client.post("/api/v1/auth/recover", json={"code": scoped_code})
        ).status_code == 429
    finally:
        for client in clients:
            await client.aclose()


@pytest.mark.asyncio
async def test_unknown_public_id_uses_dummy_argon_verification(monkeypatch) -> None:
    verified_hashes: list[str] = []

    class SpyHasher:
        def verify(self, encoded_hash: str, _: str) -> bool:
            verified_hashes.append(encoded_hash)
            return True

    monkeypatch.setattr(recovery_service, "hasher", SpyHasher())
    client = AsyncClient(transport=ASGITransport(app=app), base_url=ORIGIN)
    try:
        response = await client.post(
            "/api/v1/auth/recover",
            json={"code": "INTENTA-ABCDEFGH-00000000000000000000"},
        )
        assert response.status_code == 401
        assert verified_hashes == [recovery_service.DUMMY_SECRET_HASH]
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_recovery_rate_limit_runs_before_argon_verification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    verification_calls = 0

    async def verify(_: object, __: str) -> None:
        nonlocal verification_calls
        verification_calls += 1
        return None

    monkeypatch.setattr(recovery_routes, "verify_credential", verify)
    client = AsyncClient(transport=ASGITransport(app=app), base_url=ORIGIN)
    try:
        code = "INTENTA-ABCDEFGH-00000000000000000000"
        for _ in range(5):
            response = await client.post("/api/v1/auth/recover", json={"code": code})
            assert response.status_code == 401
        assert (await client.post("/api/v1/auth/recover", json={"code": code})).status_code == 429
        assert verification_calls == 5
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_untrusted_forwarded_for_cannot_bypass_network_recovery_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def no_argon(_: object, __: str) -> None:
        return None

    monkeypatch.setattr(recovery_routes, "verify_credential", no_argon)
    client = AsyncClient(
        transport=ASGITransport(app=app, client=("198.51.100.10", 5000)), base_url=ORIGIN
    )
    try:
        for index in range(10):
            public_id = recovery_service._encode_crockford(index, 8)
            response = await client.post(
                "/api/v1/auth/recover",
                headers={"X-Forwarded-For": f"203.0.113.{index + 1}"},
                json={"code": f"INTENTA-{public_id}-00000000000000000000"},
            )
            assert response.status_code == 401
        response = await client.post(
            "/api/v1/auth/recover",
            headers={"X-Forwarded-For": "203.0.113.250"},
            json={"code": "INTENTA-ZZZZZZZZ-00000000000000000000"},
        )
        assert response.status_code == 429
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_recovery_code_is_bounded_and_openapi_documents_actual_responses() -> None:
    client = AsyncClient(transport=ASGITransport(app=app), base_url=ORIGIN)
    try:
        oversized = await client.post("/api/v1/auth/recover", json={"code": "A" * 129})
        assert oversized.status_code == 422
        operation = app.openapi()["paths"]["/api/v1/auth/recover"]["post"]
        assert set(operation["responses"]) >= {"204", "401", "422", "429"}
        assert "content" not in operation["responses"]["204"]
        issuance = app.openapi()["paths"]["/api/v1/me/recovery-credential"]["post"]
        assert set(issuance["responses"]) >= {"200", "401", "403", "409", "422", "429"}
    finally:
        await client.aclose()
