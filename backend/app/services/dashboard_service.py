"""Dashboard aggregates. Every number is a SQL aggregate over stored data; nothing is estimated."""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.models import Finding, FindingStatus, FindingStatusHistory, Project, Scan, ScanStatus, Severity
from app.schemas.dashboard import (
    CountByLabel,
    CweCount,
    DashboardSummary,
    Indicators,
    ProjectFindings,
    StatusCount,
    TrendPoint,
    Trends,
)
from app.schemas.project import ProjectRead
from app.schemas.scan import ScanRead, SeverityCounts
from app.services.finding_service import SEVERITY_RANK, list_items_by_ids
from app.services.project_service import get_project
from app.services.scan_history_service import SCAN_TIME

RECENT_LIMIT = 5
TOP_LIMIT = 10
NOT_SET_LABEL = "Not Set"
ACTIVE_STATUSES = (FindingStatus.OPEN, FindingStatus.IN_PROGRESS, FindingStatus.REOPENED)
DONE_STATUSES = (FindingStatus.RESOLVED, FindingStatus.CLOSED)
CRITICAL_HIGH = (Severity.CRITICAL, Severity.HIGH)
MAX_DAILY_POINTS = 92


def _scoped(query: Select, column, project_id: int | None) -> Select:
    return query.where(column == project_id) if project_id is not None else query


def _severity_counts(rows: dict) -> SeverityCounts:
    return SeverityCounts(
        critical=rows.get(Severity.CRITICAL, 0),
        high=rows.get(Severity.HIGH, 0),
        medium=rows.get(Severity.MEDIUM, 0),
        low=rows.get(Severity.LOW, 0),
        informational=rows.get(Severity.INFORMATIONAL, 0),
        unclassified=rows.get(None, 0),
    )


def severity_counts(db: Session, project_id: int | None = None, active_only: bool = False) -> SeverityCounts:
    query = select(Finding.normalized_severity, func.count()).group_by(Finding.normalized_severity)
    if active_only:
        query = query.where(Finding.status.in_(ACTIVE_STATUSES))
    return _severity_counts(dict(db.execute(_scoped(query, Finding.project_id, project_id)).all()))


def findings_by_project(db: Session, limit: int = TOP_LIMIT) -> list[ProjectFindings]:
    rows = db.execute(
        select(Project.id, Project.name, Finding.normalized_severity, func.count())
        .join(Finding, Finding.project_id == Project.id)
        .group_by(Project.id, Project.name, Finding.normalized_severity)
    ).all()
    grouped: dict[int, tuple[str, dict]] = {}
    for project_id, name, severity, count in rows:
        grouped.setdefault(project_id, (name, {}))[1][severity] = count
    result = [
        ProjectFindings(project_id=pid, project_name=name, total=sum(counts.values()), severity=_severity_counts(counts))
        for pid, (name, counts) in grouped.items()
    ]
    result.sort(key=lambda r: (-r.total, r.project_name.lower()))
    return result[:limit]


def _count_by(db: Session, column) -> list[CountByLabel]:
    rows = db.execute(select(column, func.count()).group_by(column).order_by(func.count().desc())).all()
    return [CountByLabel(label=value.value if value is not None else NOT_SET_LABEL, count=count) for value, count in rows]


def _top_cwes(db: Session, project_id: int | None) -> list[CweCount]:
    counts = db.execute(
        _scoped(
            select(Finding.cwe, func.count()).where(Finding.cwe.is_not(None)).group_by(Finding.cwe),
            Finding.project_id,
            project_id,
        )
        .order_by(func.count().desc(), Finding.cwe)
        .limit(TOP_LIMIT)
    ).all()
    if not counts:
        return []
    titles = db.execute(
        _scoped(
            select(Finding.cwe, Finding.normalized_title, func.count())
            .where(Finding.cwe.in_([cwe for cwe, _ in counts]))
            .group_by(Finding.cwe, Finding.normalized_title),
            Finding.project_id,
            project_id,
        ).order_by(func.count().desc(), Finding.normalized_title)
    ).all()
    example: dict[str, str] = {}
    for cwe, title, _ in titles:
        example.setdefault(cwe, title)
    return [CweCount(cwe=cwe, count=count, example_title=example[cwe]) for cwe, count in counts]


def _indicators(db: Session, project_id: int | None) -> Indicators:
    def count(query) -> int:
        return db.scalar(_scoped(query, Finding.project_id, project_id)) or 0

    active = select(func.count()).select_from(Finding).where(Finding.status.in_(ACTIVE_STATUSES))
    since = datetime.now(timezone.utc) - timedelta(days=30)
    resolved = (
        select(func.count(func.distinct(FindingStatusHistory.finding_id)))
        .join(Finding, Finding.id == FindingStatusHistory.finding_id)
        .where(FindingStatusHistory.new_status.in_(DONE_STATUSES), FindingStatusHistory.changed_at >= since)
    )
    oldest = db.scalar(
        _scoped(
            select(func.min(Finding.first_detected)).where(
                Finding.status.in_(ACTIVE_STATUSES), Finding.normalized_severity.in_(CRITICAL_HIGH)
            ),
            Finding.project_id,
            project_id,
        )
    )
    return Indicators(
        active_findings=count(active),
        active_critical_high=count(active.where(Finding.normalized_severity.in_(CRITICAL_HIGH))),
        unassigned_active=count(active.where(Finding.assigned_to.is_(None))),
        resolved_last_30_days=count(resolved),
        oldest_active_critical_high=oldest,
    )


def get_summary(db: Session, project_id: int | None = None) -> DashboardSummary:
    if project_id is not None:
        get_project(db, project_id)

    scan_status = dict(
        db.execute(
            _scoped(select(Scan.processing_status, func.count()).group_by(Scan.processing_status), Scan.project_id, project_id)
        ).all()
    )
    statuses = dict(
        db.execute(_scoped(select(Finding.status, func.count()).group_by(Finding.status), Finding.project_id, project_id)).all()
    )
    recent_scans = db.scalars(
        _scoped(select(Scan), Scan.project_id, project_id).order_by(SCAN_TIME.desc(), Scan.id.desc()).limit(RECENT_LIMIT)
    ).all()
    latest = db.scalars(
        _scoped(select(Scan).where(Scan.processing_status == ScanStatus.COMPLETED), Scan.project_id, project_id)
        .order_by(SCAN_TIME.desc(), Scan.id.desc())
        .limit(1)
    ).first()
    critical_high_ids = list(
        db.scalars(
            _scoped(select(Finding.id).where(Finding.normalized_severity.in_(CRITICAL_HIGH)), Finding.project_id, project_id)
            .order_by(Finding.first_detected.desc(), SEVERITY_RANK.desc(), Finding.id.desc())
            .limit(RECENT_LIMIT)
        ).all()
    )
    critical_high_items = list_items_by_ids(db, critical_high_ids)
    categories = db.execute(
        _scoped(
            select(Finding.category, func.count()).where(Finding.category.is_not(None)).group_by(Finding.category),
            Finding.project_id,
            project_id,
        )
        .order_by(func.count().desc(), Finding.category)
        .limit(TOP_LIMIT)
    ).all()
    recent_projects = db.scalars(
        _scoped(select(Project), Project.id, project_id).order_by(Project.created_at.desc(), Project.id.desc()).limit(RECENT_LIMIT)
    ).all()

    return DashboardSummary(
        project_id=project_id,
        project_count=db.scalar(_scoped(select(func.count()).select_from(Project), Project.id, project_id)) or 0,
        scan_count=scan_status.get(ScanStatus.COMPLETED, 0),
        failed_scan_count=scan_status.get(ScanStatus.FAILED, 0),
        finding_count=sum(statuses.values()),
        findings_by_severity=severity_counts(db, project_id),
        active_by_severity=severity_counts(db, project_id, active_only=True),
        status_summary=[StatusCount(status=status, count=statuses.get(status, 0)) for status in FindingStatus],
        indicators=_indicators(db, project_id),
        findings_by_project=findings_by_project(db) if project_id is None else [],
        top_categories=[CountByLabel(label=label, count=count) for label, count in categories],
        top_cwes=_top_cwes(db, project_id),
        recent_scans=[ScanRead.model_validate(scan) for scan in recent_scans],
        latest_scan=ScanRead.model_validate(latest) if latest else None,
        recent_critical_high=[critical_high_items[finding_id] for finding_id in critical_high_ids],
        projects_by_status=_count_by(db, Project.status) if project_id is None else [],
        projects_by_environment=_count_by(db, Project.environment) if project_id is None else [],
        recent_projects=[ProjectRead.model_validate(project) for project in recent_projects],
    )


def _bucket(day: date, monthly: bool) -> str:
    return day.strftime("%Y-%m") if monthly else day.isoformat()


def get_trends(db: Session, project_id: int | None = None) -> Trends:
    """Findings discovered (by first detection) and resolved/closed (by status history) per period."""
    if project_id is not None:
        get_project(db, project_id)
    discovered_rows = db.execute(
        _scoped(
            select(func.date(Finding.first_detected), func.count()).group_by(func.date(Finding.first_detected)),
            Finding.project_id,
            project_id,
        )
    ).all()
    resolved_rows = db.execute(
        _scoped(
            select(func.date(FindingStatusHistory.changed_at), func.count())
            .join(Finding, Finding.id == FindingStatusHistory.finding_id)
            .where(FindingStatusHistory.new_status.in_(DONE_STATUSES))
            .group_by(func.date(FindingStatusHistory.changed_at)),
            Finding.project_id,
            project_id,
        )
    ).all()
    discovered = {date.fromisoformat(day): count for day, count in discovered_rows if day}
    resolved = {date.fromisoformat(day): count for day, count in resolved_rows if day}
    days = sorted(set(discovered) | set(resolved))
    if not days:
        return Trends(granularity="day", points=[])

    first, last = days[0], days[-1]
    monthly = (last - first).days + 1 > MAX_DAILY_POINTS
    totals: dict[str, list[int]] = {}
    cursor = first
    while cursor <= last:  # include empty periods so the time axis is continuous
        totals.setdefault(_bucket(cursor, monthly), [0, 0])
        cursor += timedelta(days=1)
    for day, count in discovered.items():
        totals[_bucket(day, monthly)][0] += count
    for day, count in resolved.items():
        totals[_bucket(day, monthly)][1] += count
    return Trends(
        granularity="month" if monthly else "day",
        points=[TrendPoint(period=period, discovered=d, resolved=r) for period, (d, r) in sorted(totals.items())],
    )
