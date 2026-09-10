import asyncio
import hashlib
import hmac
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from time import monotonic

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rate_limit import RateLimitBucket


class FixedWindowRateLimiter:
    def __init__(self, limit: int, window_seconds: float = 60.0) -> None:
        self._limit = limit
        self._window_seconds = window_seconds
        self._requests: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def allow(self, key: str) -> bool:
        now = monotonic()
        cutoff = now - self._window_seconds
        async with self._lock:
            requests = self._requests[key]
            while requests and requests[0] <= cutoff:
                requests.popleft()
            if len(requests) >= self._limit:
                return False
            requests.append(now)
            return True

    async def reset(self) -> None:
        async with self._lock:
            self._requests.clear()


def hashed_rate_limit_key(secret: str, scope: str, value: str) -> str:
    return hmac.new(secret.encode(), f"{scope}:{value}".encode(), hashlib.sha256).hexdigest()


class PostgresFixedWindowRateLimiter:
    def __init__(self, *, window_seconds: int = 60, cleanup_limit: int = 100) -> None:
        self._window_seconds = window_seconds
        self._cleanup_limit = cleanup_limit
        self._next_cleanup_at = 0.0
        self._cleanup_lock = asyncio.Lock()

    async def allow(
        self,
        db: AsyncSession,
        *,
        scope: str,
        key_hash: str,
        limit: int,
        now: datetime | None = None,
    ) -> bool:
        current = now or datetime.now(UTC)
        epoch_seconds = int(current.timestamp())
        window_started_at = datetime.fromtimestamp(
            epoch_seconds - (epoch_seconds % self._window_seconds), UTC
        )
        expires_at = window_started_at + timedelta(seconds=self._window_seconds)
        statement = (
            insert(RateLimitBucket)
            .values(
                scope=scope,
                key_hash=key_hash,
                window_started_at=window_started_at,
                count=1,
                expires_at=expires_at,
            )
            .on_conflict_do_update(
                constraint="uq_rate_limit_bucket",
                set_={"count": RateLimitBucket.count + 1, "expires_at": expires_at},
                where=RateLimitBucket.count < limit,
            )
            .returning(RateLimitBucket.count)
        )
        allowed = (await db.execute(statement)).scalar_one_or_none() is not None
        await db.commit()
        await self._cleanup_expired(db, current)
        return allowed

    async def _cleanup_expired(self, db: AsyncSession, now: datetime) -> None:
        current_monotonic = monotonic()
        if current_monotonic < self._next_cleanup_at:
            return
        async with self._cleanup_lock:
            if monotonic() < self._next_cleanup_at:
                return
            expired_ids = (
                select(RateLimitBucket.id)
                .where(RateLimitBucket.expires_at < now)
                .limit(self._cleanup_limit)
            )
            await db.execute(delete(RateLimitBucket).where(RateLimitBucket.id.in_(expired_ids)))
            await db.commit()
            self._next_cleanup_at = monotonic() + self._window_seconds
