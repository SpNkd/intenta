from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.v1.router import router as v1_router
from app.core.config import get_settings
from app.core.database import engine


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    get_settings().validate_content()
    yield
    await engine.dispose()


app = FastAPI(
    title="Intenta API",
    version="0.1.0",
    description="API-first backend for Intenta.",
    lifespan=lifespan,
    debug=get_settings().debug_enabled,
    docs_url="/docs" if get_settings().docs_enabled else None,
    redoc_url=None,
    openapi_url="/openapi.json" if get_settings().docs_enabled else None,
)
app.include_router(v1_router, prefix="/api/v1")
