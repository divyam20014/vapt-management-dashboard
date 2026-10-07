"""Local sign-in: password check, server-side sessions, first-run setup and password changes.

Nothing here logs or stores a password or session token. Failed sign-ins return one generic
message whatever the reason (unknown email, wrong password, inactive account, no password set),
so the response does not reveal which accounts exist.
"""

import logging
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import Settings
from app.core.errors import AppError
from app.models import User, UserRole, UserSession
from app.services import audit_service
from app.services.audit_service import AuditAction

logger = logging.getLogger(__name__)

SESSION_COOKIE = "vapt_session"
# last_seen_at is written at most this often, so reading pages does not write to the database every time.
_TOUCH_INTERVAL = timedelta(minutes=1)


class AuthenticationError(AppError):
    status_code = 401
    code = "not_authenticated"


class InvalidCredentialsError(AppError):
    status_code = 401
    code = "invalid_credentials"


class TooManyAttemptsError(AppError):
    status_code = 429
    code = "too_many_attempts"


class SetupNotAllowedError(AppError):
    status_code = 409
    code = "setup_complete"


class PasswordPolicyError(AppError):
    status_code = 422
    code = "validation_error"

    def __init__(self, message: str, field: str = "password"):
        super().__init__(message, details=[{"field": field, "message": message}])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


class LoginThrottle:
    """In-memory limit on failed sign-ins: per (client, email) and per client, in a sliding window.

    Kept in memory on purpose: this is a single-process local application, and a restart
    clearing the counters is acceptable.
    """

    def __init__(self, per_account: int = 5, per_client: int = 20, window_seconds: int = 900):
        self.per_account = per_account
        self.per_client = per_client
        self.window = window_seconds
        self._failures: dict[tuple, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def _recent(self, key: tuple, now: float) -> deque:
        entries = self._failures[key]
        while entries and now - entries[0] > self.window:
            entries.popleft()
        return entries

    def check(self, client: str, email: str) -> None:
        now = time.monotonic()
        with self._lock:
            if len(self._recent(("account", client, email), now)) >= self.per_account or len(
                self._recent(("client", client), now)
            ) >= self.per_client:
                raise TooManyAttemptsError(
                    f"Too many failed sign-in attempts. Wait {self.window // 60} minutes and try again."
                )

    def failed(self, client: str, email: str) -> None:
        now = time.monotonic()
        with self._lock:
            self._recent(("account", client, email), now).append(now)
            self._recent(("client", client), now).append(now)

    def succeeded(self, client: str, email: str) -> None:
        with self._lock:
            self._failures.pop(("account", client, email), None)


def setup_required(db: Session) -> bool:
    """True until somebody can sign in: no user has a password yet."""
    return db.scalar(select(func.count(User.id)).where(User.password_hash.is_not(None))) == 0


def _check_password(password: str, field: str = "password") -> None:
    problem = security.password_problem(password)
    if problem:
        raise PasswordPolicyError(problem, field)


def create_session(db: Session, settings: Settings, user: User) -> str:
    token = security.new_session_token()
    now = _now()
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=security.token_digest(token),
            created_at=now,
            last_seen_at=now,
            expires_at=now + timedelta(hours=settings.session_max_hours),
        )
    )
    user.last_login_at = now
    # Expired sessions are removed opportunistically; there is no background job.
    db.execute(delete(UserSession).where(UserSession.expires_at < now))
    return token


def resolve_session(db: Session, settings: Settings, token: str | None) -> User:
    """The active user behind a session token, or AuthenticationError."""
    if not token:
        raise AuthenticationError("Sign in to continue.")
    session = db.scalar(select(UserSession).where(UserSession.token_hash == security.token_digest(token)))
    now = _now()
    if session is None:
        raise AuthenticationError("Your session has ended. Sign in again.")
    idle_limit = _aware(session.last_seen_at) + timedelta(minutes=settings.session_idle_minutes)
    if _aware(session.expires_at) <= now or idle_limit <= now:
        db.delete(session)
        db.commit()
        raise AuthenticationError("Your session has expired. Sign in again.")
    user = db.get(User, session.user_id)
    if user is None or not user.active or user.password_hash is None:
        db.delete(session)
        db.commit()
        raise AuthenticationError("Your account can no longer sign in. Contact an Admin.")
    if now - _aware(session.last_seen_at) >= _TOUCH_INTERVAL:
        session.last_seen_at = now
        db.commit()
    return user


def login(db: Session, settings: Settings, throttle: LoginThrottle, client: str, email: str, password: str) -> tuple[User, str]:
    email = email.strip().lower()
    throttle.check(client, email)
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if user is None or user.password_hash is None:
        security.burn_password_check(password)
        ok = False
    else:
        ok = security.verify_password(password, user.password_hash) and user.active
    if not ok:
        throttle.failed(client, email)
        # The attempted email is not stored: people sometimes type a password into the email field.
        audit_service.record(db, user, AuditAction.AUTH_LOGIN_FAILED, "user", user.id if user else None,
                             {"reason": "Account unknown or cannot sign in"} if user is None else None)
        db.commit()
        logger.info("Sign-in failed user=%s", user.id if user else "unknown")
        raise InvalidCredentialsError("Email or password is incorrect.")
    throttle.succeeded(client, email)
    token = create_session(db, settings, user)
    audit_service.record(db, user, AuditAction.AUTH_LOGIN, "user", user.id)
    db.commit()
    logger.info("Sign-in user=%s", user.id)
    return user, token


def logout(db: Session, user: User, token: str | None) -> None:
    if token:
        db.execute(delete(UserSession).where(UserSession.token_hash == security.token_digest(token)))
    audit_service.record(db, user, AuditAction.AUTH_LOGOUT, "user", user.id)
    db.commit()
    logger.info("Sign-out user=%s", user.id)


def revoke_sessions(db: Session, user_id: int, keep_token: str | None = None) -> None:
    query = delete(UserSession).where(UserSession.user_id == user_id)
    if keep_token:
        query = query.where(UserSession.token_hash != security.token_digest(keep_token))
    db.execute(query)


def setup_first_admin(db: Session, settings: Settings, name: str, email: str, password: str) -> tuple[User, str]:
    """Create the first Admin. Allowed only while nobody can sign in.

    If a user with this email already exists (created before sign-in existed), that user becomes
    the Admin, so earlier history stays attributed to the same person.
    """
    if not setup_required(db):
        raise SetupNotAllowedError("Setup is already complete. Sign in instead.")
    _check_password(password)
    email = email.strip().lower()
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if user is None:
        user = User(name=name.strip(), email=email, role=UserRole.ADMIN, active=True)
        db.add(user)
    else:
        user.role, user.active = UserRole.ADMIN, True
    user.password_hash = security.hash_password(password)
    db.flush()
    if db.scalar(select(func.count(User.id)).where(User.password_hash.is_not(None), User.id != user.id)):
        # Somebody else completed setup at the same moment.
        db.rollback()
        raise SetupNotAllowedError("Setup is already complete. Sign in instead.")
    audit_service.record(db, user, AuditAction.AUTH_SETUP, "user", user.id, {"name": user.name})
    token = create_session(db, settings, user)
    db.commit()
    db.refresh(user)
    logger.info("First Admin created user=%s", user.id)
    return user, token


def change_own_password(db: Session, user: User, current_token: str | None, current_password: str, new_password: str) -> None:
    if not security.verify_password(current_password, user.password_hash):
        raise PasswordPolicyError("The current password is incorrect.", "current_password")
    _check_password(new_password, "new_password")
    if current_password == new_password:
        raise PasswordPolicyError("Choose a password different from the current one.", "new_password")
    user.password_hash = security.hash_password(new_password)
    revoke_sessions(db, user.id, keep_token=current_token)  # other browsers are signed out
    audit_service.record(db, user, AuditAction.AUTH_PASSWORD_CHANGED, "user", user.id)
    db.commit()
    logger.info("Password changed user=%s", user.id)


def set_password(db: Session, actor: User, user: User, new_password: str) -> None:
    """An Admin sets another user's password (new account or reset). Signs that user out everywhere."""
    _check_password(new_password)
    user.password_hash = security.hash_password(new_password)
    revoke_sessions(db, user.id)
    audit_service.record(db, actor, AuditAction.USER_PASSWORD_SET, "user", user.id, {"name": user.name})
