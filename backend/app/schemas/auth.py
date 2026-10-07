from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.permissions import permissions_for
from app.core.security import PASSWORD_MAX_LENGTH
from app.models import User
from app.models.enums import UserRole
from app.schemas.user import EMAIL_PATTERN


class AuthStatus(BaseModel):
    setup_required: bool
    # The signed-in user when the request carries a valid session, so the UI needs no failing /me probe.
    user: "CurrentUser | None" = None


class LoginRequest(BaseModel):
    email: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


class SetupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(max_length=320, pattern=EMAIL_PATTERN)
    password: str = Field(max_length=PASSWORD_MAX_LENGTH)

    @field_validator("name", "email", mode="before")
    @classmethod
    def strip(cls, value):
        return value.strip() if isinstance(value, str) else value


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    new_password: str = Field(max_length=PASSWORD_MAX_LENGTH)


class PasswordSet(BaseModel):
    password: str = Field(max_length=PASSWORD_MAX_LENGTH)


class CurrentUser(BaseModel):
    id: int
    name: str
    email: str
    role: UserRole
    permissions: list[str]
    last_login_at: datetime | None

    @classmethod
    def of(cls, user: User) -> "CurrentUser":
        return cls(
            id=user.id, name=user.name, email=user.email, role=user.role,
            permissions=permissions_for(user.role), last_login_at=user.last_login_at,
        )


AuthStatus.model_rebuild()
