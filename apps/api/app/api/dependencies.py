from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db_session
from app.core.security import token_matches
from app.services.auth import AuthContext, resolve_session

Database = Annotated[AsyncSession, Depends(get_db_session)]
Configuration = Annotated[Settings, Depends(get_settings)]


async def get_auth_context(
    request: Request,
    db: Database,
    settings: Configuration,
) -> AuthContext:
    session_token = request.cookies.get(settings.session_cookie_name)
    context = await resolve_session(db, session_token)
    if context is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    return context


CurrentAuth = Annotated[AuthContext, Depends(get_auth_context)]


async def require_csrf(
    request: Request,
    auth: CurrentAuth,
    settings: Configuration,
    csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> AuthContext:
    origin = request.headers.get("origin")
    if origin not in settings.allowed_origin_set:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid request origin")
    if csrf_token is None or not token_matches(csrf_token, auth.session.csrf_token_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")
    return auth


CsrfProtectedAuth = Annotated[AuthContext, Depends(require_csrf)]
