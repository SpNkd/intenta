from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPOSITORY_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPOSITORY_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://intenta:intenta@127.0.0.1:5433/intenta"
    content_dir: Path = Field(default=REPOSITORY_ROOT / "content" / "ru")
    session_cookie_name: str = "intenta_session"
    session_cookie_secure: bool = False
    session_ttl_days: int = Field(default=30, ge=1, le=365)
    allowed_origins: str = "http://127.0.0.1:3000,http://localhost:3000"
    anonymous_rate_limit_per_minute: int = Field(default=20, ge=1, le=1000)

    @property
    def allowed_origin_set(self) -> frozenset[str]:
        return frozenset(origin.strip() for origin in self.allowed_origins.split(",") if origin)


@lru_cache
def get_settings() -> Settings:
    return Settings()
