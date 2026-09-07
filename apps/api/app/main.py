from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.v1.router import router as v1_router
from app.core.content import load_content_catalog
from app.core.database import engine


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    load_content_catalog()
    yield
    await engine.dispose()


app = FastAPI(
    title="Intenta API",
    version="0.1.0",
    description="API-first backend for Intenta.",
    lifespan=lifespan,
)
app.include_router(v1_router, prefix="/api/v1")
