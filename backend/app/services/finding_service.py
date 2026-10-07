"""Findings workspace: server-side filtering/sorting/pagination, details, status and assignment."""

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from enum import Enum

from sqlalchemy import Select, case, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import AppError, NotFoundError
from app.models import (
    Finding,
    FindingOccurrence,
    FindingStatus,
    FindingStatusHistory,
    PotentialDuplicate,
    Project,
    Scan,
    Severity,
    User,
)
from app.schemas.finding import (
    BulkFindingUpdate,
    BulkUpdateResult,
    FindingDetail,
    FindingFacets,
    FindingListItem,
    FindingUpdate,
    OccurrenceRaw,
    OccurrenceRead,
    RelatedDuplicate,
    StatusHistoryRead,
)
from app.schemas.user import UserRef
from app.services import audit_service
from app.services.audit_service import AuditAction

logger = logging.getLogger(__name__)

UNCLASSIFIED = "Unclassified"
UNASSIGNED = "unassigned"

SEVERITY_RANK = case(
    (Finding.normalized_severity == Severity.CRITICAL, 5),
    (Finding.normalized_severity == Severity.HIGH, 4),
    (Finding.normalized_severity == Severity.MEDIUM, 3),
    (Finding.normalized_severity == Severity.LOW, 2),
    (Finding.normalized_severity == Severity.INFORMATIONAL, 1),
    else_=0,
)


class FindingSortField(str, Enum):
    SEVERITY = "severity"
    TITLE = "title"
    STATUS = "status"
    SOURCE = "source"
    ENDPOINT = "endpoint"
    PROJECT = "project"
    FIRST_DETECTED = "first_detected"
    LAST_DETECTED = "last_detected"
    UPDATED_AT = "updated_at"


class DateField(str, Enum):
    FIRST_DETECTED = "first_detected"
    LAST_DETECTED = "last_detected"


class SortOrder(str, Enum):
    ASC = "asc"
    DESC = "desc"


_SORT_COLUMNS = {
    FindingSortField.SEVERITY: SEVERITY_RANK,
    FindingSortField.TITLE: func.lower(Finding.normalized_title),
    FindingSortField.STATUS: Finding.status,
    FindingSortField.SOURCE: Finding.source_tool,
    FindingSortField.ENDPOINT: Finding.endpoint,
    FindingSortField.PROJECT: func.lower(Project.name),
    FindingSortField.FIRST_DETECTED: Finding.first_detected,
    FindingSortField.LAST_DETECTED: Finding.last_detected,
    FindingSortField.UPDATED_AT: Finding.updated_at,
}


class InvalidFilterError(AppError):
    status_code = 422
    code = "validation_error"


@dataclass
class FindingFilters:
    search: str | None = None
    project_ids: list[int] = field(default_factory=list)
    severities: list[str] = field(default_factory=list)  # Severity values and/or "Unclassified"
    statuses: list[FindingStatus] = field(default_factory=list)
    source_tools: list[str] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)
    assignee: str | None = None  # user id or "unassigned"
    scan_id: int | None = None  # findings observed in this scan
    date_field: DateField = DateField.LAST_DETECTED
    date_from: date | None = None
    date_to: date | None = None


def _day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=timezone.utc)


def _apply_filters(query: Select, filters: FindingFilters) -> Select:
    if filters.search and filters.search.strip():
        pattern = f"%{filters.search.strip()}%"
        query = query.where(
            or_(
                Finding.normalized_title.ilike(pattern),
                Finding.original_title.ilike(pattern),
                Finding.affected_url.ilike(pattern),
                Finding.endpoint.ilike(pattern),
                Finding.parameter.ilike(pattern),
                Finding.cwe.ilike(pattern),
                Finding.source_template.ilike(pattern),
                Finding.description.ilike(pattern),
            )
        )
    if filters.project_ids:
        query = query.where(Finding.project_id.in_(filters.project_ids))
    if filters.scan_id is not None:
        query = query.where(
            Finding.id.in_(select(FindingOccurrence.finding_id).where(FindingOccurrence.scan_id == filters.scan_id))
        )
    if filters.severities:
        known = [Severity(value) for value in filters.severities if value != UNCLASSIFIED]
        conditions = []
        if known:
            conditions.append(Finding.normalized_severity.in_(known))
        if UNCLASSIFIED in filters.severities:
            conditions.append(Finding.normalized_severity.is_(None))
        query = query.where(or_(*conditions))
    if filters.statuses:
        query = query.where(Finding.status.in_(filters.statuses))
    if filters.source_tools:
        query = query.where(Finding.source_tool.in_(filters.source_tools))
    if filters.categories:
        query = query.where(Finding.category.in_(filters.categories))
    if filters.assignee:
        if filters.assignee == UNASSIGNED:
            query = query.where(Finding.assigned_to.is_(None))
        elif filters.assignee.isdigit():
            query = query.where(Finding.assigned_to == int(filters.assignee))
        else:
            raise InvalidFilterError('assignee must be a user id or "unassigned".')
    column = Finding.first_detected if filters.date_field == DateField.FIRST_DETECTED else Finding.last_detected
    if filters.date_from:
        query = query.where(column >= _day_start(filters.date_from))
    if filters.date_to:
        query = query.where(column < _day_start(filters.date_to + timedelta(days=1)))  # inclusive end date
    return query


def _occurrence_counts():
    return (
        select(FindingOccurrence.finding_id, func.count().label("occurrence_count"))
        .group_by(FindingOccurrence.finding_id)
        .subquery()
    )


def _list_item(finding: Finding, occurrence_count: int) -> FindingListItem:
    return FindingListItem(
        id=finding.id,
        project_id=finding.project_id,
        project_name=finding.project.name,
        normalized_title=finding.normalized_title,
        original_title=finding.original_title,
        normalized_severity=finding.normalized_severity,
        original_severity=finding.original_severity,
        category=finding.category,
        endpoint=finding.endpoint,
        affected_url=finding.affected_url,
        parameter=finding.parameter,
        http_method=finding.http_method,
        source_tool=finding.source_tool,
        source_template=finding.source_template,
        cwe=finding.cwe,
        status=finding.status,
        assignee=UserRef.model_validate(finding.assignee) if finding.assignee else None,
        first_detected=finding.first_detected,
        last_detected=finding.last_detected,
        occurrence_count=occurrence_count or 0,
    )


def list_findings(
    db: Session,
    filters: FindingFilters,
    *,
    page: int,
    page_size: int,
    sort_by: FindingSortField = FindingSortField.SEVERITY,
    sort_order: SortOrder = SortOrder.DESC,
) -> tuple[list[FindingListItem], int]:
    base = _apply_filters(select(Finding.id).join(Project, Finding.project_id == Project.id), filters)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0

    counts = _occurrence_counts()
    column = _SORT_COLUMNS[sort_by]
    ordering = column.asc() if sort_order == SortOrder.ASC else column.desc()
    query = _apply_filters(
        select(Finding, counts.c.occurrence_count)
        .join(Project, Finding.project_id == Project.id)
        .outerjoin(counts, counts.c.finding_id == Finding.id),
        filters,
    ).order_by(ordering, Finding.last_detected.desc(), Finding.id.desc())
    rows = db.execute(query.offset((page - 1) * page_size).limit(page_size)).unique().all()
    return [_list_item(finding, count) for finding, count in rows], total


def list_items_by_ids(db: Session, finding_ids: list[int]) -> dict[int, FindingListItem]:
    """List items for known finding ids (one query, no N+1)."""
    if not finding_ids:
        return {}
    counts = _occurrence_counts()
    rows = db.execute(
        select(Finding, counts.c.occurrence_count)
        .outerjoin(counts, counts.c.finding_id == Finding.id)
        .where(Finding.id.in_(finding_ids))
    ).unique().all()
    return {finding.id: _list_item(finding, count) for finding, count in rows}


def get_finding(db: Session, finding_id: int) -> Finding:
    finding = db.get(Finding, finding_id)
    if finding is None:
        raise NotFoundError(f"Finding {finding_id} was not found.")
    return finding


def get_finding_detail(db: Session, finding_id: int) -> FindingDetail:
    finding = get_finding(db, finding_id)

    occurrences = db.scalars(
        select(FindingOccurrence)
        .join(Scan, FindingOccurrence.scan_id == Scan.id)
        .where(FindingOccurrence.finding_id == finding.id)
        .order_by(Scan.uploaded_at.desc(), FindingOccurrence.id)
    ).all()
    history = db.scalars(
        select(FindingStatusHistory)
        .where(FindingStatusHistory.finding_id == finding.id)
        .order_by(FindingStatusHistory.changed_at.desc(), FindingStatusHistory.id.desc())
    ).all()
    pairs = db.scalars(
        select(PotentialDuplicate).where(
            or_(PotentialDuplicate.finding_id == finding.id, PotentialDuplicate.candidate_finding_id == finding.id)
        )
    ).all()
    others = {
        other.id: other
        for other in db.scalars(
            select(Finding).where(
                Finding.id.in_({p.candidate_finding_id if p.finding_id == finding.id else p.finding_id for p in pairs})
            )
        )
    }

    item = _list_item(finding, len(occurrences))
    return FindingDetail(
        **item.model_dump(),
        scan_id=finding.scan_id,
        finding_key=finding.finding_key,
        subcategory=finding.subcategory,
        description=finding.description,
        impact=finding.impact,
        recommendation=finding.recommendation,
        evidence=finding.evidence,
        steps_to_reproduce=finding.steps_to_reproduce,
        source_reference=finding.source_reference,
        owasp=finding.owasp,
        cvss_score=finding.cvss_score,
        source_metadata=finding.source_metadata,
        created_at=finding.created_at,
        updated_at=finding.updated_at,
        occurrences=[
            OccurrenceRead(
                id=o.id,
                scan_id=o.scan_id,
                scan_name=o.scan.scan_name,
                scanner=o.scan.scanner,
                report_type=o.scan.report_type,
                scan_date=o.scan.scan_date,
                uploaded_at=o.scan.uploaded_at,
                original_title=o.original_title,
                original_severity=o.original_severity,
                affected_url=o.affected_url,
                parameter=o.parameter,
                http_method=o.http_method,
                evidence=o.evidence,
            )
            for o in occurrences
        ],
        status_history=[
            StatusHistoryRead(
                id=h.id,
                old_status=h.old_status,
                new_status=h.new_status,
                changed_by=UserRef.model_validate(h.changed_by_user) if h.changed_by_user else None,
                changed_at=h.changed_at,
                comment=h.comment,
            )
            for h in history
        ],
        potential_duplicates=[
            RelatedDuplicate(
                id=p.id,
                other_finding_id=(other_id := p.candidate_finding_id if p.finding_id == finding.id else p.finding_id),
                other_title=others[other_id].normalized_title,
                other_source=others[other_id].source_tool,
                reason=p.reason,
                confidence=p.confidence,
                decision=p.decision,
            )
            for p in pairs
        ],
    )


def get_occurrence_raw(db: Session, finding_id: int, occurrence_id: int) -> OccurrenceRaw:
    occurrence = db.get(FindingOccurrence, occurrence_id)
    if occurrence is None or occurrence.finding_id != finding_id:
        raise NotFoundError(f"Occurrence {occurrence_id} was not found for finding {finding_id}.")
    return OccurrenceRaw(
        id=occurrence.id,
        scan_id=occurrence.scan_id,
        original_filename=occurrence.scan.original_filename,
        raw_record=occurrence.raw_record,
    )


def get_facets(db: Session) -> FindingFacets:
    tools = db.scalars(select(Finding.source_tool).distinct().order_by(Finding.source_tool)).all()
    categories = db.scalars(
        select(Finding.category).where(Finding.category.is_not(None)).distinct().order_by(Finding.category)
    ).all()
    return FindingFacets(source_tools=list(tools), categories=list(categories))


# --- workflow updates ---------------------------------------------------------------------

def _resolve_assignee(db: Session, data: FindingUpdate) -> tuple[bool, User | None]:
    """(assignment requested?, user or None to unassign)."""
    if "assigned_to" not in data.model_fields_set:
        return False, None
    if data.assigned_to is None:
        return True, None
    user = db.get(User, data.assigned_to)
    if user is None:
        raise NotFoundError(f"User {data.assigned_to} was not found.")
    if not user.active:
        raise AppError(f"{user.name} is inactive and cannot be assigned findings.")
    return True, user


def _apply(db: Session, finding: Finding, data: FindingUpdate, assign: bool, assignee: User | None, actor: User) -> dict:
    """Apply a workflow change to one finding. Returns what changed (empty dict if nothing)."""
    changed: dict = {}
    if data.status is not None and data.status != finding.status:
        db.add(
            FindingStatusHistory(
                finding_id=finding.id,
                old_status=finding.status,
                new_status=data.status,
                changed_by=actor.id,
                comment=(data.comment or "").strip() or None,
            )
        )
        changed["status"] = {"from": finding.status.value, "to": data.status.value}
        finding.status = data.status
    if assign and finding.assigned_to != (assignee.id if assignee else None):
        changed["assigned_to"] = {
            "from": finding.assigned_to,
            "to": assignee.id if assignee else None,
        }
        finding.assignee = assignee  # sets assigned_to and keeps the loaded relationship current
    return changed


def update_finding(db: Session, finding_id: int, data: FindingUpdate, actor: User) -> FindingDetail:
    finding = get_finding(db, finding_id)
    assign, assignee = _resolve_assignee(db, data)
    changed = _apply(db, finding, data, assign, assignee, actor)
    comment = (data.comment or "").strip() or None
    if "status" in changed:
        audit_service.record(db, actor, AuditAction.FINDING_STATUS_CHANGED, "finding", finding.id, {**changed["status"], "comment": comment})
    if "assigned_to" in changed:
        audit_service.record(db, actor, AuditAction.FINDING_ASSIGNED, "finding", finding.id, changed["assigned_to"])
    db.commit()
    logger.info("Finding updated id=%s by user=%s changes=%s", finding.id, actor.id, sorted(changed))
    return get_finding_detail(db, finding.id)


def bulk_update(db: Session, data: BulkFindingUpdate, actor: User) -> BulkUpdateResult:
    """All-or-nothing: unknown ids abort the whole operation before anything changes."""
    ids = list(dict.fromkeys(data.finding_ids))
    findings = {f.id: f for f in db.scalars(select(Finding).where(Finding.id.in_(ids)))}
    missing = [finding_id for finding_id in ids if finding_id not in findings]
    if missing:
        raise NotFoundError(f"{len(missing)} selected finding(s) no longer exist. Nothing was changed.", details={"missing_ids": missing})
    assign, assignee = _resolve_assignee(db, data)

    updated_ids: list[int] = []
    try:
        for finding_id in ids:
            if _apply(db, findings[finding_id], data, assign, assignee, actor):
                updated_ids.append(finding_id)
        if updated_ids:
            audit_service.record(
                db,
                actor,
                AuditAction.FINDINGS_BULK_UPDATED,
                "finding",
                None,
                {
                    "finding_ids": updated_ids,
                    "status": data.status.value if data.status else None,
                    "assigned_to": (assignee.id if assignee else None) if assign else "unchanged",
                    "comment": (data.comment or "").strip() or None,
                },
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    logger.info("Bulk update by user=%s requested=%d updated=%d", actor.id, len(ids), len(updated_ids))
    return BulkUpdateResult(requested=len(ids), updated=len(updated_ids), unchanged=len(ids) - len(updated_ids), updated_ids=updated_ids)
