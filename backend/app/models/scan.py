from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, UTCDateTime, utcnow
from app.models.enums import ReportType, Scanner, ScanStatus
from app.models.project import Project
from app.models.types import string_enum


class Scan(Base):
    """One uploaded report. Failed uploads are recorded too, with the reason."""

    __tablename__ = "scans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    scan_name: Mapped[str] = mapped_column(String(255), nullable=False)
    scanner: Mapped[Scanner | None] = mapped_column(string_enum(Scanner))
    report_type: Mapped[ReportType | None] = mapped_column(string_enum(ReportType, length=10))
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    # Relative to UPLOAD_DIRECTORY; never exposed through the API.
    stored_file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    scan_date: Mapped[datetime | None] = mapped_column(UTCDateTime)
    uploaded_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)
    processing_status: Mapped[ScanStatus] = mapped_column(string_enum(ScanStatus), nullable=False)
    total_findings: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    critical_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    high_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    medium_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    low_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    informational_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processing_error: Mapped[str | None] = mapped_column(Text)

    project: Mapped[Project] = relationship(lazy="joined")

    @property
    def project_name(self) -> str:
        return self.project.name

    __table_args__ = (
        Index("ix_scans_project_id", "project_id"),
        Index("ix_scans_file_hash", "project_id", "file_hash"),
        Index("ix_scans_uploaded_at", "uploaded_at"),
    )
