from datetime import datetime

from pydantic import BaseModel

from app.models.enums import FindingStatus
from app.schemas.finding import FindingListItem
from app.schemas.project import ProjectRead
from app.schemas.scan import ScanRead, SeverityCounts


class CountByLabel(BaseModel):
    label: str
    count: int


class StatusCount(BaseModel):
    status: FindingStatus
    count: int


class ProjectFindings(BaseModel):
    project_id: int
    project_name: str
    total: int
    severity: SeverityCounts


class CweCount(BaseModel):
    cwe: str
    count: int
    # The most common finding title with this CWE, so the number is recognisable.
    example_title: str


class Indicators(BaseModel):
    """Management indicators. "Active" = Open, In Progress or Reopened."""

    active_findings: int
    active_critical_high: int
    unassigned_active: int
    resolved_last_30_days: int
    oldest_active_critical_high: datetime | None


class DashboardSummary(BaseModel):
    """Dashboard metrics, all derived from SQLite. `project_id` set = scoped to one project."""

    project_id: int | None
    project_count: int
    scan_count: int  # successfully processed scans
    failed_scan_count: int
    finding_count: int
    findings_by_severity: SeverityCounts
    active_by_severity: SeverityCounts
    status_summary: list[StatusCount]
    indicators: Indicators
    findings_by_project: list[ProjectFindings]
    top_categories: list[CountByLabel]
    top_cwes: list[CweCount]
    recent_scans: list[ScanRead]
    latest_scan: ScanRead | None
    recent_critical_high: list[FindingListItem]
    projects_by_status: list[CountByLabel]
    projects_by_environment: list[CountByLabel]
    recent_projects: list[ProjectRead]


class TrendPoint(BaseModel):
    period: str  # YYYY-MM-DD or YYYY-MM
    discovered: int  # findings first detected in the period
    resolved: int  # transitions to Resolved or Closed recorded in the period


class Trends(BaseModel):
    granularity: str  # "day" or "month"
    points: list[TrendPoint]
