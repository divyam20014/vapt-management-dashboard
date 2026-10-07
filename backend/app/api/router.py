from fastapi import APIRouter

from app.api import dashboard, health, projects, settings

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(projects.router)
api_router.include_router(dashboard.router)
api_router.include_router(settings.router)
