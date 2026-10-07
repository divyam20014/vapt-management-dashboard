import logging

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.models import User, UserRole
from app.schemas.user import UserCreate, UserUpdate
from app.services import audit_service, auth_service
from app.services.audit_service import AuditAction

logger = logging.getLogger(__name__)


def _email_conflict(email: str) -> ConflictError:
    return ConflictError(f'A user with email "{email}" already exists.', details=[{"field": "email", "message": "Email must be unique"}])


def _email_taken(db: Session, email: str, exclude_id: int | None = None) -> bool:
    query = select(User.id).where(func.lower(User.email) == email.lower())
    if exclude_id is not None:
        query = query.where(User.id != exclude_id)
    return db.scalar(query) is not None


def list_users(db: Session, include_inactive: bool = True) -> list[User]:
    query = select(User).order_by(User.active.desc(), func.lower(User.name))
    if not include_inactive:
        query = query.where(User.active.is_(True))
    return list(db.scalars(query))


def get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError(f"User {user_id} was not found.")
    return user


def _admins_who_can_sign_in(db: Session) -> int:
    return db.scalar(
        select(func.count(User.id)).where(User.role == UserRole.ADMIN, User.active.is_(True), User.password_hash.is_not(None))
    ) or 0


def _guard_last_admin(db: Session, user: User, changes: dict, actor: User) -> None:
    """Refuse changes that would leave nobody able to manage users, or lock the actor out mid-session."""
    if user.id == actor.id and changes.get("active") is False:
        raise ConflictError("You cannot deactivate your own account.")
    if user.id == actor.id and "role" in changes and changes["role"] != UserRole.ADMIN:
        raise ConflictError("You cannot remove your own Admin role. Ask another Admin.")
    loses_admin = changes.get("active") is False or ("role" in changes and changes["role"] != UserRole.ADMIN)
    if (
        loses_admin
        and user.role == UserRole.ADMIN
        and user.active
        and user.password_hash is not None
        and _admins_who_can_sign_in(db) <= 1
    ):
        raise ConflictError("This is the last active Admin who can sign in. Make another user an Admin first.")


def create_user(db: Session, data: UserCreate, actor: User) -> User:
    if _email_taken(db, data.email):
        raise _email_conflict(data.email)
    fields = data.model_dump(exclude={"password"})
    user = User(**fields, active=True)
    db.add(user)
    try:
        db.flush()
        audit_service.record(db, actor, AuditAction.USER_CREATED, "user", user.id, {"name": user.name, "role": user.role.value})
        if data.password is not None:
            auth_service.set_password(db, actor, user, data.password)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _email_conflict(data.email) from exc
    db.refresh(user)
    logger.info("User created id=%s", user.id)
    return user


def update_user(db: Session, user_id: int, data: UserUpdate, actor: User) -> User:
    user = get_user(db, user_id)
    changes = data.model_dump(exclude_unset=True)
    _guard_last_admin(db, user, changes, actor)
    if "email" in changes and _email_taken(db, changes["email"], exclude_id=user_id):
        raise _email_conflict(changes["email"])
    before = {field: getattr(user, field) for field in changes}
    for field, value in changes.items():
        setattr(user, field, value)
    diff = {
        field: {"from": getattr(old, "value", old), "to": getattr(changes[field], "value", changes[field])}
        for field, old in before.items()
        if old != changes[field] and field != "email"
    }
    if "email" in changes and before["email"] != changes["email"]:
        diff["email"] = {"changed": True}
    if diff:
        audit_service.record(db, actor, AuditAction.USER_UPDATED, "user", user.id, diff)
    if changes.get("active") is False:
        auth_service.revoke_sessions(db, user.id)  # a deactivated user is signed out everywhere
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _email_conflict(changes.get("email", user.email)) from exc
    db.refresh(user)
    return user


def set_password(db: Session, user_id: int, password: str, actor: User) -> User:
    user = get_user(db, user_id)
    auth_service.set_password(db, actor, user, password)
    db.commit()
    db.refresh(user)
    logger.info("Password set for user=%s by user=%s", user.id, actor.id)
    return user
