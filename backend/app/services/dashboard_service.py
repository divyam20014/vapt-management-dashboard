from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Finding, Project, Scan, ScanStatus, Severity
from app.schemas.dashboard import CountByLabel, DashboardSummary
from app.schemas.project import ProjectRead
from app.schemas.scan import ScanRead, SeverityCounts

RECENT_LIMIT = 5
NOT_SET_LABEL = "Not Set"


def _count_by(db: Session, column) -> list[CountByLabel]:
    rows = db.execute(select(column, func.count()).group_by(column).order_by(func.count().desc())).all()
    return [
        CountByLabel(label=value.value if value is not None else NOT_SET_LABEL, count=count)
        for value, count in rows
    ]


def _severity_counts(db: Session) -> tuple[int, SeverityCounts]:
    rows = dict(db.execute(select(Finding.normalized_severity, func.count()).group_by(Finding.normalized_severity)).all())
    counts = SeverityCounts(
        critical=rows.get(Severity.CRITICAL, 0),
        high=rows.get(Severity.HIGH, 0),
        medium=rows.get(Severity.MEDIUM, 0),
        low=rows.get(Severity.LOW, 0),
        informational=rows.get(Severity.INFORMATIONAL, 0),
        unclassified=rows.get(None, 0),
    )
    return sum(rows.values()), counts


def get_summary(db: Session) -> DashboardSummary:
    project_count = db.scalar(select(func.count()).select_from(Project)) or 0
    recent_projects = db.scalars(
        select(Project).order_by(Project.created_at.desc(), Project.id.desc()).limit(RECENT_LIMIT)
    ).all()
    scan_status = dict(db.execute(select(Scan.processing_status, func.count()).group_by(Scan.processing_status)).all())
    recent_scans = db.scalars(select(Scan).order_by(Scan.uploaded_at.desc(), Scan.id.desc()).limit(RECENT_LIMIT)).all()
    finding_count, by_severity = _severity_counts(db)

    return DashboardSummary(
        project_count=project_count,
        projects_by_status=_count_by(db, Project.status),
        projects_by_environment=_count_by(db, Project.environment),
        recent_projects=[ProjectRead.model_validate(project) for project in recent_projects],
        scan_count=scan_status.get(ScanStatus.COMPLETED, 0),
        failed_scan_count=scan_status.get(ScanStatus.FAILED, 0),
        finding_count=finding_count,
        findings_by_severity=by_severity,
        recent_scans=[ScanRead.model_validate(scan) for scan in recent_scans],
    )
