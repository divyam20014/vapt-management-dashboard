from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require
from app.core.permissions import Permission
from app.database import get_db
from app.models import User
from app.schemas.auth import PasswordSet
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRead])
def list_users(include_inactive: bool = Query(True), db: Session = Depends(get_db)):
    """Every signed-in user can list users (assignee names and filters)."""
    return user_service.list_users(db, include_inactive)


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(data: UserCreate, db: Session = Depends(get_db), actor: User = Depends(require(Permission.USERS_MANAGE))):
    return user_service.create_user(db, data, actor)


@router.put("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int, data: UserUpdate, db: Session = Depends(get_db), actor: User = Depends(require(Permission.USERS_MANAGE))
):
    return user_service.update_user(db, user_id, data, actor)


@router.put("/{user_id}/password", response_model=UserRead)
def set_user_password(
    user_id: int, data: PasswordSet, db: Session = Depends(get_db), actor: User = Depends(require(Permission.USERS_MANAGE))
):
    """Set or reset a user's password. That user is signed out everywhere."""
    return user_service.set_password(db, user_id, data.password, actor)
