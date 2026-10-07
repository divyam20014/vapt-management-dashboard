from datetime import datetime
from enum import Enum

from pydantic import BaseModel

from app.schemas.finding import FindingListItem
from app.schemas.scan import ScanRead


class Classification(str, Enum):
    NEW = "New"
    RESOLVED = "Resolved"
    PERSISTENT = "Persistent"
    REOPENED = "Reopened"


class ScanRef(BaseModel):
    id: int
    scan_name: str
    scan_time: datetime


class FindingRef(BaseModel):
    id: int
    title: str


class ComparisonItem(BaseModel):
    classification: Classification
    finding: FindingListItem
    reason: str
    base_observations: int
    compare_observations: int
    # For Reopened: the most recent scan before the baseline that detected the finding.
    last_seen_before_base: ScanRef | None = None
    # Persistent only: the baseline finding with the same check and location but a different report title.
    renamed_from: FindingRef | None = None
    # A workflow status that disagrees with what the scans show (statuses are never changed automatically).
    attention: str | None = None


class ComparisonCounts(BaseModel):
    new: int
    resolved: int
    persistent: int
    reopened: int


class ComparisonResult(BaseModel):
    project_id: int
    project_name: str
    base: ScanRead
    compare: ScanRead
    reordered: bool
    warnings: list[str]
    counts: ComparisonCounts
    items: list[ComparisonItem]
