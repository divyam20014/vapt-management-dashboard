from fastapi import APIRouter

from app.api import dashboard, findings, health, projects, scans, settings, users

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(projects.router)
api_router.include_router(scans.router)
api_router.include_router(findings.router)
api_router.include_router(users.router)
api_router.include_router(dashboard.router)
api_router.include_router(settings.router)
