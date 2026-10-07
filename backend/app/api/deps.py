"""Request-scoped dependencies: the signed-in user and permission checks.

Authorization is enforced here, on the server. Every router except health and the public auth
endpoints is mounted behind `current_user` (see `router.py`), so a new endpoint is protected by
default; endpoints that change data add `require(Permission.X)`.
"""

from collections.abc import Callable

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.permissions import Permission, has_permission
from app.database import get_db
from app.models import User
from app.services import auth_service


class PermissionDeniedError(AppError):
    status_code = 403
    code = "forbidden"


def session_token(request: Request) -> str | None:
    return request.cookies.get(auth_service.SESSION_COOKIE)


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user = auth_service.resolve_session(db, request.app.state.settings, session_token(request))
    request.state.user = user
    return user


def require(permission: Permission) -> Callable[..., User]:
    def dependency(user: User = Depends(current_user)) -> User:
        if not has_permission(user.role, permission):
            raise PermissionDeniedError(f"Your role ({user.role.value}) does not allow this action.")
        return user

    dependency.__name__ = f"require_{permission.name.lower()}"
    return dependency


def client_address(request: Request) -> str:
    return request.client.host if request.client else "unknown"
