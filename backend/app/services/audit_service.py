"""Audit trail. Entries are added to the caller's session so they commit atomically with the change."""

from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog, User


class AuditAction:
    PROJECT_CREATED = "project.created"
    PROJECT_UPDATED = "project.updated"
    PROJECT_DELETED = "project.deleted"
    REPORT_UPLOADED = "report.uploaded"
    REPORT_FAILED = "report.failed"
    FINDING_STATUS_CHANGED = "finding.status_changed"
    FINDING_ASSIGNED = "finding.assigned"
    FINDINGS_BULK_UPDATED = "findings.bulk_updated"
    SCANS_COMPARED = "scans.compared"
    USER_CREATED = "user.created"
    USER_UPDATED = "user.updated"


def record(
    db: Session,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_id: int | None,
    details: dict[str, Any] | None = None,
) -> AuditLog:
    entry = AuditLog(
        user_id=actor.id if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details or None,
    )
    db.add(entry)
    return entry
