from datetime import datetime

from sqlalchemy import JSON, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, UTCDateTime, utcnow
from app.models.enums import FindingStatus
from app.models.types import string_enum
from app.models.user import User


class FindingStatusHistory(Base):
    """Every status change of a finding. `old_status` is NULL for the initial status at detection."""

    __tablename__ = "finding_status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    finding_id: Mapped[int] = mapped_column(ForeignKey("findings.id"), nullable=False)
    old_status: Mapped[FindingStatus | None] = mapped_column(string_enum(FindingStatus))
    new_status: Mapped[FindingStatus] = mapped_column(string_enum(FindingStatus), nullable=False)
    # NULL when the change was made by the system (e.g. finding created from an upload).
    changed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    changed_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)
    comment: Mapped[str | None] = mapped_column(Text)

    changed_by_user: Mapped[User | None] = relationship(lazy="joined")

    __table_args__ = (Index("ix_status_history_finding_id", "finding_id", "changed_at"),)


class AuditLog(Base):
    """Important actions. Never contains credentials or secrets."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[int | None] = mapped_column(Integer)
    details: Mapped[dict | None] = mapped_column(JSON)
    timestamp: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)

    __table_args__ = (
        Index("ix_audit_logs_entity", "entity_type", "entity_id"),
        Index("ix_audit_logs_timestamp", "timestamp"),
    )
