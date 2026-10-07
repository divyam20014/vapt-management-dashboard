from datetime import datetime

from sqlalchemy import JSON, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UTCDateTime, utcnow


class RemediationGuideline(Base):
    """Standard remediation guidance (application content, not scanner evidence).

    Built-in records are synchronised from `app/remediation/library.py` on start-up. Findings are
    linked at read time by exact rules (`zap_rules`, `nuclei_rules`, `cwe_ids`), so the link
    always reflects the current library and never alters a finding.
    """

    __tablename__ = "remediation_guidelines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    owasp: Mapped[str | None] = mapped_column(String(100))
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    steps: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    verification: Mapped[str | None] = mapped_column(Text)
    references: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    cwe_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    zap_rules: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    nuclei_rules: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow, onupdate=utcnow)
