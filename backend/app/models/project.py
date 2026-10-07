from datetime import datetime

from sqlalchemy import Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UTCDateTime, utcnow
from app.models.enums import ProjectEnvironment, ProjectStatus
from app.models.types import string_enum


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    application_name: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    environment: Mapped[ProjectEnvironment | None] = mapped_column(string_enum(ProjectEnvironment))
    application_url: Mapped[str | None] = mapped_column(String(2048))
    owner: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[ProjectStatus] = mapped_column(
        string_enum(ProjectStatus), nullable=False, default=ProjectStatus.ACTIVE
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        Index("ix_projects_status", "status"),
        Index("ix_projects_created_at", "created_at"),
    )
