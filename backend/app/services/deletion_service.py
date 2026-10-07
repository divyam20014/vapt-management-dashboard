"""Deliberate, Admin-only deletion of a scan or a finding.

Deletion is explicit and audited; parsing never deletes anything. Each operation runs in one
transaction, so either everything listed below happens or nothing does.

Deleting a scan:
- removes its occurrences (the records that scan contributed);
- removes findings that no other scan observed, with their history and duplicate suggestions;
- keeps findings that other scans also observed, unchanged except that their first/last detection
  dates and originating scan are recalculated from the scans that remain (status and history stay);
- removes duplicate suggestions recorded during that upload;
- deletes the stored original file after the database commit. The audit entry keeps its name and
  SHA-256 hash.

Deleting a finding removes it with its occurrences, status history and duplicate suggestions.
Scan totals are not changed: they record what each report contained.
"""

import logging

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models import Finding, FindingOccurrence, FindingStatusHistory, PotentialDuplicate, Scan, User
from app.services import audit_service
from app.services.audit_service import AuditAction
from app.services.finding_service import get_finding
from app.services.scan_history_service import SCAN_TIME, get_scan

logger = logging.getLogger(__name__)
_CHUNK = 500


def _chunks(ids: list[int]):
    for start in range(0, len(ids), _CHUNK):
        yield ids[start : start + _CHUNK]


def _delete_findings(db: Session, finding_ids: list[int]) -> None:
    for chunk in _chunks(finding_ids):
        db.execute(delete(PotentialDuplicate).where(
            or_(PotentialDuplicate.finding_id.in_(chunk), PotentialDuplicate.candidate_finding_id.in_(chunk))
        ))
        db.execute(delete(FindingStatusHistory).where(FindingStatusHistory.finding_id.in_(chunk)))
        db.execute(delete(FindingOccurrence).where(FindingOccurrence.finding_id.in_(chunk)))
        db.execute(delete(Finding).where(Finding.id.in_(chunk)))


def delete_scan(db: Session, settings: Settings, scan_id: int, actor: User) -> dict:
    scan = get_scan(db, scan_id)
    affected = sorted(set(db.scalars(select(FindingOccurrence.finding_id).where(FindingOccurrence.scan_id == scan.id))))
    try:
        db.execute(delete(PotentialDuplicate).where(PotentialDuplicate.detected_in_scan_id == scan.id))
        db.execute(delete(FindingOccurrence).where(FindingOccurrence.scan_id == scan.id))

        # What remains for the affected findings, from the other scans.
        remaining: dict[int, tuple] = {}
        for chunk in _chunks(affected):
            rows = db.execute(
                select(FindingOccurrence.finding_id, func.min(SCAN_TIME), func.max(SCAN_TIME))
                .join(Scan, Scan.id == FindingOccurrence.scan_id)
                .where(FindingOccurrence.finding_id.in_(chunk))
                .group_by(FindingOccurrence.finding_id)
            ).all()
            remaining.update({finding_id: (first, last) for finding_id, first, last in rows})
        orphaned = [finding_id for finding_id in affected if finding_id not in remaining]
        _delete_findings(db, orphaned)

        kept = [finding_id for finding_id in affected if finding_id in remaining]
        for chunk in _chunks(kept):
            for finding in db.scalars(select(Finding).where(Finding.id.in_(chunk))):
                finding.first_detected, finding.last_detected = remaining[finding.id]
        # Findings first created by this scan point at the earliest remaining scan that observed them.
        for finding in db.scalars(select(Finding).where(Finding.scan_id == scan.id)):
            finding.scan_id = db.scalar(
                select(Scan.id).join(FindingOccurrence, FindingOccurrence.scan_id == Scan.id)
                .where(FindingOccurrence.finding_id == finding.id)
                .order_by(SCAN_TIME.asc(), Scan.id.asc()).limit(1)
            )

        summary = {
            "file": scan.original_filename, "sha256": scan.file_hash, "scan_name": scan.scan_name,
            "status": scan.processing_status.value, "findings_removed": len(orphaned), "findings_kept": len(kept),
        }
        stored_path = scan.stored_file_path
        db.delete(scan)
        audit_service.record(db, actor, AuditAction.SCAN_DELETED, "scan", scan_id, summary, project_id=scan.project_id)
        db.commit()
    except Exception:
        db.rollback()
        raise

    # Only after the commit: a failed transaction must never lose the original.
    root = settings.upload_path.resolve()
    path = (root / stored_path).resolve()
    if path.is_relative_to(root):
        path.unlink(missing_ok=True)
    logger.info("Scan deleted id=%s by user=%s removed=%d kept=%d", scan_id, actor.id, len(orphaned), len(kept))
    return summary


def delete_finding(db: Session, finding_id: int, actor: User) -> dict:
    finding = get_finding(db, finding_id)
    occurrences = db.scalar(select(func.count()).select_from(FindingOccurrence).where(FindingOccurrence.finding_id == finding.id))
    summary = {
        "title": finding.normalized_title, "severity": finding.normalized_severity, "status": finding.status.value,
        "source_tool": finding.source_tool, "endpoint": finding.endpoint, "fingerprint": finding.finding_key,
        "occurrences": occurrences,
    }
    try:
        _delete_findings(db, [finding.id])
        audit_service.record(db, actor, AuditAction.FINDING_DELETED, "finding", finding_id, summary, project_id=finding.project_id)
        db.commit()
    except Exception:
        db.rollback()
        raise
    logger.info("Finding deleted id=%s by user=%s", finding_id, actor.id)
    return summary
