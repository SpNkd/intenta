from fastapi import APIRouter

from app.api.v1.routes.auth import router as auth_router
from app.api.v1.routes.experiment import router as experiment_router
from app.api.v1.routes.health import router as health_router
from app.api.v1.routes.intentions import router as intentions_router
from app.api.v1.routes.me import router as me_router

router = APIRouter()
router.include_router(health_router)
router.include_router(auth_router)
router.include_router(me_router)
router.include_router(experiment_router)
router.include_router(intentions_router)
