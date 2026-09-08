import ipaddress
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
LOCAL_RECOVERY_RATE_LIMIT_HMAC_KEY = "local-development-only-change-me"
LOCAL_DATABASE_URL = "postgresql+psycopg://intenta:intenta@127.0.0.1:5433/intenta"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPOSITORY_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["development", "test", "production"] = "development"
    database_url: str = LOCAL_DATABASE_URL
    content_dir: Path = Field(default=REPOSITORY_ROOT / "content" / "ru")
    session_cookie_name: str = "intenta_session"
    session_cookie_secure: bool = False
    session_ttl_days: int = Field(default=30, ge=1, le=365)
    allowed_origins: str = "http://127.0.0.1:3000,http://localhost:3000"
    anonymous_rate_limit_per_minute: int = Field(default=20, ge=1, le=1000)
    recovery_rate_limit_hmac_key: str = Field(
        default=LOCAL_RECOVERY_RATE_LIMIT_HMAC_KEY, min_length=16
    )
    trusted_proxy_cidrs: str = ""
    api_docs_enabled: bool | None = None
    debug: bool | None = None

    @model_validator(mode="after")
    def validate_environment(self) -> "Settings":
        if not self.content_dir.is_dir():
            raise ValueError("content_dir must exist and be a directory")
        if self.app_env != "production":
            return self
        if self.database_url == LOCAL_DATABASE_URL:
            raise ValueError("production requires an explicit DATABASE_URL")
        if self.session_cookie_name != "__Host-intenta_session":
            raise ValueError("production requires __Host-intenta_session")
        if not self.session_cookie_secure:
            raise ValueError("production requires a Secure session cookie")
        if self.recovery_rate_limit_hmac_key == LOCAL_RECOVERY_RATE_LIMIT_HMAC_KEY:
            raise ValueError("production requires an independent recovery rate-limit HMAC key")
        if len(self.recovery_rate_limit_hmac_key) < 32:
            raise ValueError(
                "production recovery rate-limit HMAC key must be at least 32 characters"
            )
        origins = self.allowed_origin_set
        if not origins or any(
            not origin.startswith("https://") or "*" in origin for origin in origins
        ):
            raise ValueError("production ALLOWED_ORIGINS must contain exact HTTPS origins only")
        if not self.trusted_proxy_networks:
            raise ValueError("production requires TRUSTED_PROXY_CIDRS")
        if self.api_docs_enabled is None:
            raise ValueError("production requires an explicit API_DOCS_ENABLED policy")
        if self.debug is not False:
            raise ValueError("production requires an explicit DEBUG=false policy")
        return self

    @property
    def allowed_origin_set(self) -> frozenset[str]:
        return frozenset(origin.strip() for origin in self.allowed_origins.split(",") if origin)

    @property
    def trusted_proxy_networks(self) -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
        if not self.trusted_proxy_cidrs.strip():
            return ()
        try:
            return tuple(
                ipaddress.ip_network(value.strip())
                for value in self.trusted_proxy_cidrs.split(",")
                if value.strip()
            )
        except ValueError as error:
            raise ValueError("TRUSTED_PROXY_CIDRS must contain valid CIDRs") from error

    @property
    def docs_enabled(self) -> bool:
        return (
            self.app_env != "production" if self.api_docs_enabled is None else self.api_docs_enabled
        )

    @property
    def debug_enabled(self) -> bool:
        return self.debug is True

    def validate_content(self) -> None:
        from app.core.content import ContentCatalog

        ContentCatalog.load(self.content_dir)


@lru_cache
def get_settings() -> Settings:
    return Settings()
