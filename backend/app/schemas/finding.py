from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import DuplicateConfidence, DuplicateDecision, FindingStatus, ReportType, Scanner, Severity
from app.schemas.user import UserRef

MAX_BULK_FINDINGS = 500


class FindingListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    project_name: str
    normalized_title: str
    original_title: str
    normalized_severity: Severity | None
    original_severity: str | None
    category: str | None
    endpoint: str | None
    affected_url: str | None
    parameter: str | None
    http_method: str | None
    source_tool: str
    source_template: str | None
    cwe: str | None
    status: FindingStatus
    assignee: UserRef | None
    first_detected: datetime
    last_detected: datetime
    occurrence_count: int


class OccurrenceRead(BaseModel):
    id: int
    scan_id: int
    scan_name: str
    scanner: Scanner | None
    report_type: ReportType | None
    scan_date: datetime | None
    uploaded_at: datetime
    original_title: str
    original_severity: str | None
    affected_url: str | None
    parameter: str | None
    http_method: str | None
    evidence: str | None


class OccurrenceRaw(BaseModel):
    id: int
    scan_id: int
    original_filename: str
    raw_record: dict[str, Any]


class StatusHistoryRead(BaseModel):
    id: int
    old_status: FindingStatus | None
    new_status: FindingStatus
    changed_by: UserRef | None
    changed_at: datetime
    comment: str | None


class RelatedDuplicate(BaseModel):
    id: int
    other_finding_id: int
    other_title: str
    other_source: str
    reason: str
    confidence: DuplicateConfidence
    decision: DuplicateDecision


class FindingDetail(FindingListItem):
    scan_id: int
    finding_key: str
    subcategory: str | None
    description: str | None
    impact: str | None
    recommendation: str | None
    evidence: str | None
    steps_to_reproduce: str | None
    source_reference: str | None
    owasp: str | None
    cvss_score: float | None
    source_metadata: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime
    occurrences: list[OccurrenceRead]
    status_history: list[StatusHistoryRead]
    potential_duplicates: list[RelatedDuplicate]


class FindingUpdate(BaseModel):
    """Only workflow fields can change; report content is never editable."""

    model_config = ConfigDict(extra="forbid")

    status: FindingStatus | None = None
    assigned_to: int | None = Field(default=None, description="User id; null to unassign.")
    comment: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def something_to_change(self):
        if self.status is None and "assigned_to" not in self.model_fields_set:
            raise ValueError("Provide a new status and/or assigned_to.")
        if "status" in self.model_fields_set and self.status is None:
            raise ValueError("Status cannot be empty.")
        return self


class BulkFindingUpdate(FindingUpdate):
    finding_ids: list[int] = Field(min_length=1, max_length=MAX_BULK_FINDINGS)


class BulkUpdateResult(BaseModel):
    requested: int
    updated: int
    unchanged: int
    updated_ids: list[int]


class FindingFacets(BaseModel):
    source_tools: list[str]
    categories: list[str]
