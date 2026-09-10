import asyncio
import threading
import time

import anyio
import pytest
from sqlalchemy import delete, select

from app.core.config import get_settings
from app.core.database import SessionFactory
from app.core.rate_limit import PostgresFixedWindowRateLimiter, hashed_rate_limit_key
from app.models import RateLimitBucket
from app.services import recovery as recovery_service


@pytest.fixture(autouse=True)
async def clear_rate_limit_buckets() -> None:
    async with SessionFactory() as db:
        await db.execute(delete(RateLimitBucket))
        await db.commit()
    yield
    async with SessionFactory() as db:
        await db.execute(delete(RateLimitBucket))
        await db.commit()


async def allow_with_new_session(
    limiter: PostgresFixedWindowRateLimiter, *, scope: str, key_hash: str, limit: int
) -> bool:
    async with SessionFactory() as db:
        return await limiter.allow(db, scope=scope, key_hash=key_hash, limit=limit)


@pytest.mark.asyncio
async def test_limiter_is_shared_by_independent_instances_and_survives_restart() -> None:
    first = PostgresFixedWindowRateLimiter()
    restarted = PostgresFixedWindowRateLimiter()
    assert await allow_with_new_session(first, scope="recovery-network", key_hash="a" * 64, limit=2)
    assert await allow_with_new_session(
        restarted, scope="recovery-network", key_hash="a" * 64, limit=2
    )
    assert not await allow_with_new_session(
        restarted, scope="recovery-network", key_hash="a" * 64, limit=2
    )


@pytest.mark.asyncio
async def test_concurrent_burst_cannot_exceed_limit() -> None:
    limiter = PostgresFixedWindowRateLimiter()
    results = await asyncio.gather(
        *(
            allow_with_new_session(limiter, scope="recovery-network", key_hash="b" * 64, limit=3)
            for _ in range(12)
        )
    )
    assert sum(results) == 3


@pytest.mark.asyncio
async def test_rate_limit_keys_and_scopes_are_isolated_and_hashed() -> None:
    limiter = PostgresFixedWindowRateLimiter()
    key = hashed_rate_limit_key("test-key", "recovery-network", "203.0.113.1")
    assert await allow_with_new_session(limiter, scope="recovery-network", key_hash=key, limit=1)
    assert not await allow_with_new_session(
        limiter, scope="recovery-network", key_hash=key, limit=1
    )
    assert await allow_with_new_session(limiter, scope="recovery-public-id", key_hash=key, limit=1)
    assert await allow_with_new_session(
        limiter, scope="recovery-network", key_hash="c" * 64, limit=1
    )
    async with SessionFactory() as db:
        buckets = list((await db.scalars(select(RateLimitBucket))).all())
    assert all("203.0.113.1" not in bucket.key_hash for bucket in buckets)
    assert {bucket.scope for bucket in buckets} == {"recovery-network", "recovery-public-id"}


@pytest.mark.asyncio
async def test_argon2_runs_off_event_loop_and_respects_capacity_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    main_thread = threading.get_ident()
    active = 0
    peak = 0
    lock = threading.Lock()
    worker_threads: list[int] = []

    class SlowHasher:
        def hash(self, _: str) -> str:
            nonlocal active, peak
            with lock:
                active += 1
                peak = max(peak, active)
                worker_threads.append(threading.get_ident())
            time.sleep(0.02)
            with lock:
                active -= 1
            return "hash"

    monkeypatch.setattr(recovery_service, "hasher", SlowHasher())
    monkeypatch.setattr(recovery_service, "argon2_limiter", anyio.CapacityLimiter(1))
    await asyncio.gather(*(recovery_service.hash_recovery_secret("secret") for _ in range(4)))
    assert peak == 1
    assert worker_threads and all(thread != main_thread for thread in worker_threads)
    assert get_settings().argon2_max_concurrency == 2
