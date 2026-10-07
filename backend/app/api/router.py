from fastapi import APIRouter, Depends

from app.api import audit, auth, dashboard, exports, findings, health, projects, remediation, scans, settings, users
from app.api.deps import current_user

api_router = APIRouter(prefix="/api")

# Public: liveness, and the auth router (status/setup/login are public; its other routes require a session themselves).
api_router.include_router(health.router)
api_router.include_router(auth.router)

# Everything else requires a signed-in user. Routes that change data also check a permission.
_signed_in = [Depends(current_user)]
for module in (projects, scans, findings, exports, remediation, users, dashboard, settings, audit):
    api_router.include_router(module.router, dependencies=_signed_in)
