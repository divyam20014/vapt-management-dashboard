from pydantic import BaseModel

from app.schemas.project import ProjectRead
from app.schemas.scan import ScanRead, SeverityCounts


class CountByLabel(BaseModel):
    label: str
    count: int


class DashboardSummary(BaseModel):
    """Dashboard metrics, all derived from SQLite."""

    project_count: int
    projects_by_status: list[CountByLabel]
    projects_by_environment: list[CountByLabel]
    recent_projects: list[ProjectRead]
    scan_count: int  # successfully processed scans
    failed_scan_count: int
    finding_count: int
    findings_by_severity: SeverityCounts
    recent_scans: list[ScanRead]
