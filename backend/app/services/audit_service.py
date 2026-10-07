"""Audit trail. Entries are added to the caller's session so they commit atomically with the change."""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AuditLog, Finding, Project, User


class AuditAction:
    PROJECT_CREATED = "project.created"
    PROJECT_UPDATED = "project.updated"
    PROJECT_DELETED = "project.deleted"
    REPORT_UPLOADED = "report.uploaded"
    REPORT_FAILED = "report.failed"
    REPORT_DUPLICATE_ACCEPTED = "report.duplicate_accepted"
    REPORTS_BULK_UPLOADED = "reports.bulk_uploaded"
    FINDING_STATUS_CHANGED = "finding.status_changed"
    FINDING_ASSIGNED = "finding.assigned"
    FINDINGS_BULK_UPDATED = "findings.bulk_updated"
    DUPLICATE_DECIDED = "duplicate.decided"
    FINDING_DELETED = "finding.deleted"
    SCAN_DELETED = "scan.deleted"
    SCANS_COMPARED = "scans.compared"
    REPORT_EXPORTED = "report.exported"
    USER_CREATED = "user.created"
    USER_UPDATED = "user.updated"
    USER_PASSWORD_SET = "user.password_set"
    AUTH_SETUP = "auth.setup_completed"
    AUTH_LOGIN = "auth.login"
    AUTH_LOGIN_FAILED = "auth.login_failed"
    AUTH_LOGOUT = "auth.logout"
    AUTH_PASSWORD_CHANGED = "auth.password_changed"


ACTION_LABELS: dict[str, str] = {
    AuditAction.PROJECT_CREATED: "Project created",
    AuditAction.PROJECT_UPDATED: "Project updated",
    AuditAction.PROJECT_DELETED: "Project deleted",
    AuditAction.REPORT_UPLOADED: "Report uploaded",
    AuditAction.REPORT_FAILED: "Report upload failed",
    AuditAction.REPORT_DUPLICATE_ACCEPTED: "Duplicate report uploaded anyway",
    AuditAction.REPORTS_BULK_UPLOADED: "Bulk upload",
    AuditAction.FINDING_STATUS_CHANGED: "Finding status changed",
    AuditAction.FINDING_ASSIGNED: "Finding assigned",
    AuditAction.FINDINGS_BULK_UPDATED: "Findings bulk updated",
    AuditAction.DUPLICATE_DECIDED: "Potential duplicate decision",
    AuditAction.FINDING_DELETED: "Finding deleted",
    AuditAction.SCAN_DELETED: "Scan deleted",
    AuditAction.SCANS_COMPARED: "Scans compared",
    AuditAction.REPORT_EXPORTED: "Export",
    AuditAction.USER_CREATED: "User created",
    AuditAction.USER_UPDATED: "User updated",
    AuditAction.USER_PASSWORD_SET: "Password set by an Admin",
    AuditAction.AUTH_SETUP: "First Admin created",
    AuditAction.AUTH_LOGIN: "Signed in",
    AuditAction.AUTH_LOGIN_FAILED: "Sign-in failed",
    AuditAction.AUTH_LOGOUT: "Signed out",
    AuditAction.AUTH_PASSWORD_CHANGED: "Password changed",
}


def record(
    db: Session,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_id: int | None,
    details: dict[str, Any] | None = None,
    *,
    project_id: int | None = None,
    finding_id: int | None = None,
) -> AuditLog:
    """`project_id`/`finding_id` default to the entity itself when it is a project or finding."""
    if project_id is None and entity_type == "project":
        project_id = entity_id
    if finding_id is None and entity_type == "finding":
        finding_id = entity_id
    entry = AuditLog(
        user_id=actor.id if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details or None,
        project_id=project_id,
        finding_id=finding_id,
    )
    db.add(entry)
    return entry


@dataclass
class AuditFilters:
    user_id: int | None = None
    actions: list[str] | None = None
    project_id: int | None = None
    finding_id: int | None = None
    date_from: date | None = None
    date_to: date | None = None


def list_entries(db: Session, filters: AuditFilters, page: int, page_size: int) -> tuple[list[dict], int]:
    """Newest first. Project and finding names are joined in (outer joins: the entity may be gone)."""
    conditions = []
    if filters.user_id is not None:
        conditions.append(AuditLog.user_id == filters.user_id)
    if filters.actions:
        conditions.append(AuditLog.action.in_(filters.actions))
    if filters.project_id is not None:
        conditions.append(AuditLog.project_id == filters.project_id)
    if filters.finding_id is not None:
        conditions.append(AuditLog.finding_id == filters.finding_id)
    if filters.date_from:
        conditions.append(AuditLog.timestamp >= datetime.combine(filters.date_from, time.min, tzinfo=timezone.utc))
    if filters.date_to:
        conditions.append(AuditLog.timestamp < datetime.combine(filters.date_to + timedelta(days=1), time.min, tzinfo=timezone.utc))

    total = db.scalar(select(func.count(AuditLog.id)).where(*conditions)) or 0
    rows = db.execute(
        select(AuditLog, User.name, Project.name, Finding.normalized_title)
        .outerjoin(User, User.id == AuditLog.user_id)
        .outerjoin(Project, Project.id == AuditLog.project_id)
        .outerjoin(Finding, Finding.id == AuditLog.finding_id)
        .where(*conditions)
        .order_by(AuditLog.timestamp.desc(), AuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    items = [
        {
            "id": entry.id,
            "timestamp": entry.timestamp,
            "action": entry.action,
            "action_label": ACTION_LABELS.get(entry.action, entry.action),
            "entity_type": entry.entity_type,
            "entity_id": entry.entity_id,
            "user": {"id": entry.user_id, "name": user_name} if entry.user_id is not None else None,
            "project": {"id": entry.project_id, "name": project_name} if entry.project_id is not None else None,
            "finding": {"id": entry.finding_id, "title": finding_title} if entry.finding_id is not None else None,
            "details": entry.details,
        }
        for entry, user_name, project_name, finding_title in rows
    ]
    return items, total


def action_catalog(db: Session) -> list[dict[str, str]]:
    """Known actions plus any older codes already stored, for the filter list."""
    stored = set(db.scalars(select(AuditLog.action).distinct()))
    codes = list(ACTION_LABELS) + sorted(stored - set(ACTION_LABELS))
    return [{"code": code, "label": ACTION_LABELS.get(code, code)} for code in codes]
