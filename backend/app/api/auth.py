from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import client_address, current_user, session_token
from app.database import get_db
from app.models import User
from app.schemas.auth import AuthStatus, CurrentUser, LoginRequest, PasswordChange, SetupRequest
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_cookie(response: Response, request: Request, token: str) -> None:
    settings = request.app.state.settings
    response.set_cookie(
        auth_service.SESSION_COOKIE,
        token,
        max_age=settings.session_max_hours * 3600,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="strict",
        path="/api",
    )


def _clear_cookie(response: Response, request: Request) -> None:
    response.delete_cookie(
        auth_service.SESSION_COOKIE, path="/api", httponly=True, samesite="strict",
        secure=request.app.state.settings.session_cookie_secure,
    )


@router.get("/status", response_model=AuthStatus)
def auth_status(request: Request, db: Session = Depends(get_db)):
    """Public: whether the first Admin still has to be created, and who is signed in (if anyone)."""
    if auth_service.setup_required(db):
        return AuthStatus(setup_required=True)
    token = session_token(request)
    user = None
    if token:
        try:
            user = CurrentUser.of(auth_service.resolve_session(db, request.app.state.settings, token))
        except auth_service.AuthenticationError:
            user = None
    return AuthStatus(setup_required=False, user=user)


@router.post("/setup", response_model=CurrentUser, status_code=status.HTTP_201_CREATED)
def setup(data: SetupRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    """Public, one time only: create the first Admin while nobody can sign in, and sign them in."""
    user, token = auth_service.setup_first_admin(db, request.app.state.settings, data.name, data.email, data.password)
    _set_cookie(response, request, token)
    return CurrentUser.of(user)


@router.post("/login", response_model=CurrentUser)
def login(data: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    user, token = auth_service.login(
        db, request.app.state.settings, request.app.state.login_throttle, client_address(request), data.email, data.password
    )
    _set_cookie(response, request, token)
    return CurrentUser.of(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)) -> Response:
    auth_service.logout(db, user, session_token(request))
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_cookie(response, request)
    return response


@router.get("/me", response_model=CurrentUser)
def me(user: User = Depends(current_user)):
    return CurrentUser.of(user)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(data: PasswordChange, request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)) -> Response:
    """Other sessions of this user are signed out; this one stays signed in."""
    auth_service.change_own_password(db, user, session_token(request), data.current_password, data.new_password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
