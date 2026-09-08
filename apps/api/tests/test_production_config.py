from pathlib import Path

import pytest
from fastapi import Response
from pydantic import ValidationError

from app.core.config import LOCAL_RECOVERY_RATE_LIMIT_HMAC_KEY, Settings
from app.core.network import trusted_client_ip
from app.core.security import set_session_cookie


def production_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "app_env": "production",
        "database_url": "postgresql+psycopg://app:secret@database/intenta",
        "allowed_origins": "https://intenta.example",
        "recovery_rate_limit_hmac_key": "a" * 32,
        "session_cookie_name": "__Host-intenta_session",
        "session_cookie_secure": True,
        "trusted_proxy_cidrs": "10.0.0.0/8",
        "api_docs_enabled": False,
        "debug": False,
    }
    values.update(overrides)
    return Settings(**values)


@pytest.mark.parametrize(
    "overrides",
    [
        {"allowed_origins": "http://intenta.example"},
        {"allowed_origins": "https://*.example"},
        {"recovery_rate_limit_hmac_key": LOCAL_RECOVERY_RATE_LIMIT_HMAC_KEY},
        {"recovery_rate_limit_hmac_key": "short"},
        {"debug": None},
        {"debug": True},
    ],
)
def test_production_rejects_defaults_and_insecure_values(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        production_settings(**overrides)


def test_production_rejects_all_local_defaults() -> None:
    with pytest.raises(ValidationError):
        Settings(app_env="production")


def test_production_cookie_has_host_prefix_attributes_without_domain() -> None:
    settings = production_settings()
    response = Response()
    set_session_cookie(response, settings, "token")
    header = response.headers["set-cookie"]
    assert header.startswith("__Host-intenta_session=token;")
    assert "HttpOnly" in header
    assert "Path=/" in header
    assert "SameSite=lax" in header
    assert "Secure" in header
    assert "Domain=" not in header


def test_untrusted_peer_cannot_spoof_forwarded_client_ip() -> None:
    settings = production_settings()
    assert (
        trusted_client_ip(peer_ip="198.51.100.7", forwarded_for="203.0.113.9", settings=settings)
        == "198.51.100.7"
    )
    assert (
        trusted_client_ip(peer_ip="10.1.2.3", forwarded_for="203.0.113.9", settings=settings)
        == "203.0.113.9"
    )


def test_development_and_test_keep_local_defaults() -> None:
    for app_env in ("development", "test"):
        settings = Settings(app_env=app_env)
        assert settings.session_cookie_name == "intenta_session"
        assert settings.session_cookie_secure is False
        assert settings.docs_enabled is True
        assert settings.debug_enabled is False


def test_production_content_validation_is_explicit(tmp_path: Path) -> None:
    settings = production_settings(content_dir=tmp_path)
    with pytest.raises(ValueError, match="no content documents"):
        settings.validate_content()
