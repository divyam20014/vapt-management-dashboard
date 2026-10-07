from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import DuplicateConfidence, ReportType, Scanner, ScanStatus


class ScanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    project_name: str
    scan_name: str
    scanner: Scanner | None
    report_type: ReportType | None
    original_filename: str
    scan_date: datetime | None
    uploaded_at: datetime
    processing_status: ScanStatus
    total_findings: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    informational_count: int
    processing_error: str | None


class SeverityCounts(BaseModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    informational: int = 0
    # Findings whose report severity does not map to the standard scale.
    unclassified: int = 0


class PotentialDuplicateRead(BaseModel):
    finding_id: int
    finding_title: str
    finding_source: str
    candidate_finding_id: int
    candidate_title: str
    candidate_source: str
    endpoint: str | None
    reason: str
    confidence: DuplicateConfidence


class UploadResult(BaseModel):
    scan: ScanRead
    parser: str
    records_parsed: int
    new_findings: int
    existing_findings: int
    severity_counts: SeverityCounts
    potential_duplicates: list[PotentialDuplicateRead]
    warnings: list[str]
