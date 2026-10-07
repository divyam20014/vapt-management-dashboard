from datetime import datetime

from sqlalchemy import JSON, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, UTCDateTime, utcnow
from app.models.enums import DuplicateConfidence, DuplicateDecision, FindingStatus, Severity
from app.models.project import Project
from app.models.scan import Scan
from app.models.types import string_enum
from app.models.user import User


class Finding(Base):
    """A vulnerability tracked per project, identified by a stable fingerprint (`finding_key`).

    Content fields hold the values from the report that first introduced the finding and are
    never overwritten. Every report observation is kept verbatim in `finding_occurrences`.
    """

    __tablename__ = "findings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    # Scan that first introduced this finding.
    scan_id: Mapped[int] = mapped_column(ForeignKey("scans.id"), nullable=False)
    finding_key: Mapped[str] = mapped_column(String(64), nullable=False)

    original_title: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_title: Mapped[str] = mapped_column(Text, nullable=False)
    original_severity: Mapped[str | None] = mapped_column(String(50))
    # NULL when the report severity does not map to one of the five standard levels.
    normalized_severity: Mapped[Severity | None] = mapped_column(string_enum(Severity))
    category: Mapped[str | None] = mapped_column(String(200))
    subcategory: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    impact: Mapped[str | None] = mapped_column(Text)
    recommendation: Mapped[str | None] = mapped_column(Text)
    affected_url: Mapped[str | None] = mapped_column(Text)
    endpoint: Mapped[str | None] = mapped_column(Text)
    parameter: Mapped[str | None] = mapped_column(Text)
    http_method: Mapped[str | None] = mapped_column(String(20))
    evidence: Mapped[str | None] = mapped_column(Text)
    steps_to_reproduce: Mapped[str | None] = mapped_column(Text)
    source_tool: Mapped[str] = mapped_column(String(50), nullable=False)
    source_template: Mapped[str | None] = mapped_column(String(255))
    source_reference: Mapped[str | None] = mapped_column(Text)
    cwe: Mapped[str | None] = mapped_column(String(100))
    owasp: Mapped[str | None] = mapped_column(String(255))
    cvss_score: Mapped[float | None] = mapped_column(Float)
    # Scanner-specific fields with no dedicated column (e.g. ZAP confidence/WASC, Nuclei matcher-name/type).
    source_metadata: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[FindingStatus] = mapped_column(string_enum(FindingStatus), nullable=False, default=FindingStatus.OPEN)
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    first_detected: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    last_detected: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow, onupdate=utcnow)

    project: Mapped[Project] = relationship(lazy="joined")
    assignee: Mapped[User | None] = relationship(lazy="joined")

    __table_args__ = (
        UniqueConstraint("project_id", "finding_key", name="uq_findings_project_key"),
        Index("ix_findings_project_id", "project_id"),
        Index("ix_findings_scan_id", "scan_id"),
        Index("ix_findings_severity", "normalized_severity"),
        Index("ix_findings_status", "status"),
        Index("ix_findings_finding_key", "finding_key"),
        Index("ix_findings_source_tool", "source_tool"),
        Index("ix_findings_endpoint", "project_id", "endpoint"),
        Index("ix_findings_assigned_to", "assigned_to"),
        Index("ix_findings_last_detected", "last_detected"),
        Index("ix_findings_first_detected", "first_detected"),
    )


class FindingOccurrence(Base):
    """One observation of a finding in one scan, stored exactly as reported."""

    __tablename__ = "finding_occurrences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    finding_id: Mapped[int] = mapped_column(ForeignKey("findings.id"), nullable=False)
    scan_id: Mapped[int] = mapped_column(ForeignKey("scans.id"), nullable=False)
    original_title: Mapped[str] = mapped_column(Text, nullable=False)
    original_severity: Mapped[str | None] = mapped_column(String(50))
    affected_url: Mapped[str | None] = mapped_column(Text)
    parameter: Mapped[str | None] = mapped_column(Text)
    http_method: Mapped[str | None] = mapped_column(String(20))
    evidence: Mapped[str | None] = mapped_column(Text)
    # The complete original record from the report (alert + instance, or Nuclei result).
    raw_record: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)

    finding: Mapped[Finding] = relationship()
    scan: Mapped[Scan] = relationship(lazy="joined")

    __table_args__ = (
        Index("ix_occurrences_finding_id", "finding_id"),
        Index("ix_occurrences_scan_id", "scan_id"),
    )


class PotentialDuplicate(Base):
    """Two findings that may describe the same issue. Never merged automatically."""

    __tablename__ = "potential_duplicates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    finding_id: Mapped[int] = mapped_column(ForeignKey("findings.id"), nullable=False)
    candidate_finding_id: Mapped[int] = mapped_column(ForeignKey("findings.id"), nullable=False)
    detected_in_scan_id: Mapped[int] = mapped_column(ForeignKey("scans.id"), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[DuplicateConfidence] = mapped_column(string_enum(DuplicateConfidence), nullable=False)
    decision: Mapped[DuplicateDecision] = mapped_column(
        string_enum(DuplicateDecision), nullable=False, default=DuplicateDecision.PENDING
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)

    __table_args__ = (
        UniqueConstraint("finding_id", "candidate_finding_id", name="uq_potential_duplicate_pair"),
        Index("ix_potential_duplicates_project_id", "project_id"),
    )
