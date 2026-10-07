from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import UserRole

_EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


def _strip(value):
    return value.strip() if isinstance(value, str) else value


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(max_length=320, pattern=_EMAIL_PATTERN)
    role: UserRole = UserRole.SECURITY_ANALYST

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
    email: str | None = Field(default=None, max_length=320, pattern=_EMAIL_PATTERN)
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


class UserRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
