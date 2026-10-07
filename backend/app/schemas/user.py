from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.security import PASSWORD_MAX_LENGTH
from app.models.enums import UserRole

EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


def _strip(value):
    return value.strip() if isinstance(value, str) else value


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(max_length=320, pattern=EMAIL_PATTERN)
    role: UserRole = UserRole.SECURITY_ANALYST
    # Optional: without a password the user can be assigned findings but cannot sign in yet.
    password: str | None = Field(default=None, max_length=PASSWORD_MAX_LENGTH)

    @field_validator("name", "email", mode="before")
    @classmethod
    def strip(cls, value):
        return _strip(value)

    @field_validator("email")
    @classmethod
    def lower(cls, value: str) -> str:
        return value.lower()


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = Field(default=None, max_length=320, pattern=EMAIL_PATTERN)
    role: UserRole | None = None
    active: bool | None = None

    @field_validator("name", "email", mode="before")
    @classmethod
    def strip(cls, value):
        return _strip(value)

    @field_validator("email")
    @classmethod
    def lower(cls, value):
        return value.lower() if value else value

    @field_validator("name", "email", "role", "active")
    @classmethod
    def not_null(cls, value):
        if value is None:
            raise ValueError("This field cannot be empty")
        return value


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: UserRole
    active: bool
    created_at: datetime
    can_sign_in: bool
    last_login_at: datetime | None


class UserRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
