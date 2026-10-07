from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_acting_user
from app.database import get_db
from app.models import FindingStatus, Severity, User
from app.schemas.common import Page
from app.schemas.finding import (
    BulkFindingUpdate,
    BulkUpdateResult,
    FindingDetail,
    FindingFacets,
    FindingListItem,
    FindingUpdate,
    OccurrenceRaw,
)
from app.services import finding_service
from app.services.finding_service import UNCLASSIFIED, DateField, FindingFilters, FindingSortField, InvalidFilterError, SortOrder

router = APIRouter(prefix="/findings", tags=["findings"])

_SEVERITY_FILTER_VALUES = {s.value for s in Severity} | {UNCLASSIFIED}


@router.get("", response_model=Page[FindingListItem])
def list_findings(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: str | None = Query(None, max_length=200),
    project_id: list[int] = Query(default=[]),
    scan_id: int | None = Query(None, description="Only findings observed in this scan."),
    severity: list[str] = Query(default=[], description='Severity values and/or "Unclassified". Repeat for several.'),
    status: list[FindingStatus] = Query(default=[]),
    source_tool: list[str] = Query(default=[]),
    category: list[str] = Query(default=[]),
    assignee: str | None = Query(None, description='User id or "unassigned".'),
    date_field: DateField = Query(DateField.LAST_DETECTED),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    sort_by: FindingSortField = Query(FindingSortField.SEVERITY),
    sort_order: SortOrder = Query(SortOrder.DESC),
    db: Session = Depends(get_db),
):
    unknown = sorted(set(severity) - _SEVERITY_FILTER_VALUES)
    if unknown:
        raise InvalidFilterError(f"Unknown severity filter: {', '.join(unknown)}.")
    if date_from and date_to and date_from > date_to:
        raise InvalidFilterError("date_from must be on or before date_to.")
    filters = FindingFilters(
        search=search,
        project_ids=project_id,
        scan_id=scan_id,
        severities=severity,
        statuses=status,
        source_tools=source_tool,
        categories=category,
        assignee=assignee,
        date_field=date_field,
        date_from=date_from,
        date_to=date_to,
    )
    items, total = finding_service.list_findings(db, filters, page=page, page_size=page_size, sort_by=sort_by, sort_order=sort_order)
    return Page[FindingListItem](items=items, total=total, page=page, page_size=page_size)


@router.get("/facets", response_model=FindingFacets)
def get_facets(db: Session = Depends(get_db)):
    return finding_service.get_facets(db)


@router.post("/bulk-update", response_model=BulkUpdateResult)
def bulk_update(data: BulkFindingUpdate, db: Session = Depends(get_db), actor: User = Depends(require_acting_user)):
    return finding_service.bulk_update(db, data, actor)


@router.get("/{finding_id}", response_model=FindingDetail)
def get_finding(finding_id: int, db: Session = Depends(get_db)):
    return finding_service.get_finding_detail(db, finding_id)


@router.put("/{finding_id}", response_model=FindingDetail)
def update_finding(
    finding_id: int, data: FindingUpdate, db: Session = Depends(get_db), actor: User = Depends(require_acting_user)
):
    return finding_service.update_finding(db, finding_id, data, actor)


@router.get("/{finding_id}/occurrences/{occurrence_id}/raw", response_model=OccurrenceRaw)
def get_occurrence_raw(finding_id: int, occurrence_id: int, db: Session = Depends(get_db)):
    return finding_service.get_occurrence_raw(db, finding_id, occurrence_id)
