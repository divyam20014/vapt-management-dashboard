from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import ProjectEnvironment, ProjectStatus

OPTIONAL_TEXT_FIELDS = ("application_name", "description", "owner", "application_url")


def _blank_to_none(value):
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def _check_url(value: str | None) -> str | None:
    if value is not None and not value.lower().startswith(("http://", "https://")):
        raise ValueError("Application URL must start with http:// or https://")
    return value


class ProjectBase(BaseModel):
    application_name: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    environment: ProjectEnvironment | None = None
    application_url: str | None = Field(default=None, max_length=2048)
    owner: str | None = Field(default=None, max_length=200)

    @field_validator(*OPTIONAL_TEXT_FIELDS, mode="before")
    @classmethod
    def blank_strings_are_none(cls, value):
        return _blank_to_none(value)

    @field_validator("environment", mode="before")
    @classmethod
    def blank_environment_is_none(cls, value):
        return _blank_to_none(value)

    @field_validator("application_url")
    @classmethod
    def validate_url(cls, value):
        return _check_url(value)


class ProjectCreate(ProjectBase):
    name: str = Field(min_length=1, max_length=200)
    status: ProjectStatus = ProjectStatus.ACTIVE

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class ProjectUpdate(ProjectBase):
    """Partial update: only fields present in the request body are changed."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    status: ProjectStatus | None = None

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("name", "status")
    @classmethod
    def not_null(cls, value):
        if value is None:
            raise ValueError("This field cannot be empty")
        return value


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    application_name: str | None
    description: str | None
    environment: ProjectEnvironment | None
    application_url: str | None
    owner: str | None
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime
