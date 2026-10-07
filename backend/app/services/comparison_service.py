"""Scan comparison by finding fingerprint (finding identity), never by title.

Given an older baseline scan A and a newer scan B of the same project:
- New:        detected in B, not in A, and never detected in any scan before A.
- Reopened:   detected in B, not in A, but detected in a scan before A.
- Resolved:   detected in A, not in B.
- Persistent: detected in both A and B. Also: a finding only in A and a finding only in B that share
              tool, check id (plugin/template) and location, differing only in report title, are shown
              as one Persistent item, so a title change is never reported as a resolution.

Workflow statuses are not changed; disagreements are reported as `attention` notes.
"""

import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import FindingOccurrence, FindingStatus, Scan, ScanStatus, User
from app.schemas.comparison import Classification, ComparisonCounts, ComparisonItem, ComparisonResult, FindingRef, ScanRef
from app.schemas.finding import FindingListItem
from app.schemas.scan import ScanRead
from app.services import audit_service
from app.services.audit_service import AuditAction
from app.services.finding_service import list_items_by_ids
from app.services.scan_history_service import SCAN_TIME, earlier_than, get_scan, scan_time

logger = logging.getLogger(__name__)

_DETECTED_AGAIN_CONFLICT = {FindingStatus.RESOLVED, FindingStatus.CLOSED}
_STILL_ACTIVE = {FindingStatus.OPEN, FindingStatus.IN_PROGRESS, FindingStatus.REOPENED}
_ORDER = {Classification.NEW: 0, Classification.REOPENED: 1, Classification.RESOLVED: 2, Classification.PERSISTENT: 3}


class ComparisonError(AppError):
    status_code = 422
    code = "invalid_comparison"


def _observations(db: Session, scan_id: int) -> dict[int, int]:
    rows = db.execute(
        select(FindingOccurrence.finding_id, func.count())
        .where(FindingOccurrence.scan_id == scan_id)
        .group_by(FindingOccurrence.finding_id)
    ).all()
    return dict(rows)


def _last_seen_before(db: Session, base: Scan, finding_ids: set[int]) -> dict[int, Scan]:
    """For each finding, the most recent completed scan before `base` that detected it."""
    if not finding_ids:
        return {}
    rows = db.execute(
        select(FindingOccurrence.finding_id, Scan)
        .join(Scan, FindingOccurrence.scan_id == Scan.id)
        .where(
            FindingOccurrence.finding_id.in_(finding_ids),
            Scan.project_id == base.project_id,
            Scan.processing_status == ScanStatus.COMPLETED,
            earlier_than(base),
        )
        .order_by(SCAN_TIME.asc(), Scan.id.asc())
    ).all()
    latest: dict[int, Scan] = {}
    for finding_id, scan in rows:
        latest[finding_id] = scan  # ascending order: the last assignment is the most recent
    return latest


def _ref(scan: Scan) -> ScanRef:
    return ScanRef(id=scan.id, scan_name=scan.scan_name, scan_time=scan_time(scan))


def _label(scan: Scan) -> str:
    return f'"{scan.scan_name}" (#{scan.id})'


def compare_scans(db: Session, base_scan_id: int, compare_scan_id: int, actor: User | None = None) -> ComparisonResult:
    if base_scan_id == compare_scan_id:
        raise ComparisonError("Choose two different scans to compare.")
    base, current = get_scan(db, base_scan_id), get_scan(db, compare_scan_id)
    if base.project_id != current.project_id:
        raise ComparisonError("Scans can only be compared within the same project.")
    for scan in (base, current):
        if scan.processing_status != ScanStatus.COMPLETED:
            raise ComparisonError(f"Scan {_label(scan)} failed to process and has no findings to compare.")

    reordered = (scan_time(base), base.id) > (scan_time(current), current.id)
    if reordered:
        base, current = current, base

    warnings: list[str] = []
    if reordered:
        warnings.append("The scans were swapped so that the older scan is the baseline.")
    if base.scanner != current.scanner:
        warnings.append(
            f"The scans come from different tools ({base.scanner.value} and {current.scanner.value}). A finding is only "
            "reported by the tool that detects it, so New and Resolved here reflect tool coverage, not remediation."
        )

    in_base, in_current = _observations(db, base.id), _observations(db, current.id)
    for role, scan, observed in (("baseline", base, in_base), ("current", current, in_current)):
        if not observed:
            other = "Resolved" if role == "current" else "New"
            warnings.append(
                f"The {role} scan {_label(scan)} contains no findings. Confirm the report is complete and covers the same "
                f"target before treating every finding as {other}."
            )
    appeared = set(in_current) - set(in_base)
    seen_earlier = _last_seen_before(db, base, appeared)

    classification: dict[int, Classification] = {}
    for finding_id in in_current:
        if finding_id in in_base:
            classification[finding_id] = Classification.PERSISTENT
        elif finding_id in seen_earlier:
            classification[finding_id] = Classification.REOPENED
        else:
            classification[finding_id] = Classification.NEW
    for finding_id in set(in_base) - set(in_current):
        classification[finding_id] = Classification.RESOLVED

    findings = list_items_by_ids(db, list(classification))
    renamed = _pair_title_changes(findings, classification)
    for old_id, new_id in renamed.items():
        classification.pop(old_id)
        classification[new_id] = Classification.PERSISTENT
    renamed_from = {new_id: old_id for old_id, new_id in renamed.items()}

    items: list[ComparisonItem] = []
    for finding_id, kind in classification.items():
        item = findings[finding_id]
        a, b = in_base.get(finding_id, 0), in_current.get(finding_id, 0)
        previous = seen_earlier.get(finding_id)
        if kind == Classification.NEW:
            reason = f"Detected in {_label(current)}, not in {_label(base)}, and in no earlier scan of this project."
        elif kind == Classification.REOPENED:
            reason = (
                f"Not detected in {_label(base)}, but detected earlier in {_label(previous)} "
                f"and again in {_label(current)}."
            )
        elif kind == Classification.RESOLVED:
            reason = f"Detected in {_label(base)} but not in {_label(current)}."
        elif finding_id in renamed_from:
            old = findings[renamed_from[finding_id]]
            a = in_base.get(old.id, 0)
            reason = (
                f"Same check ({item.source_tool} {item.source_template}) at the same location in both scans; the report "
                f"title changed from \"{old.normalized_title}\" to \"{item.normalized_title}\"."
            )
        else:
            reason = f"Detected in both scans ({a} observation(s) in the baseline, {b} in the current scan)."

        attention = None
        if kind != Classification.RESOLVED and item.status in _DETECTED_AGAIN_CONFLICT:
            attention = f"Marked {item.status.value}, but detected in {_label(current)}."
        elif kind == Classification.RESOLVED and item.status in _STILL_ACTIVE:
            attention = f"Not detected in {_label(current)}; status is still {item.status.value}. Verify the fix and update the status."

        items.append(
            ComparisonItem(
                classification=kind,
                finding=item,
                reason=reason,
                base_observations=a,
                compare_observations=b,
                last_seen_before_base=_ref(previous) if previous and finding_id not in renamed_from else None,
                renamed_from=(
                    FindingRef(id=renamed_from[finding_id], title=findings[renamed_from[finding_id]].normalized_title)
                    if finding_id in renamed_from
                    else None
                ),
                attention=attention,
            )
        )

    items.sort(key=lambda i: (_ORDER[i.classification], -_severity_rank(i), i.finding.normalized_title.lower(), i.finding.id))
    counts = ComparisonCounts(
        new=sum(i.classification == Classification.NEW for i in items),
        resolved=sum(i.classification == Classification.RESOLVED for i in items),
        persistent=sum(i.classification == Classification.PERSISTENT for i in items),
        reopened=sum(i.classification == Classification.REOPENED for i in items),
    )

    audit_service.record(
        db, actor, AuditAction.SCANS_COMPARED, "scan", current.id,
        {"base_scan_id": base.id, "compare_scan_id": current.id, **counts.model_dump()},
    )
    db.commit()
    logger.info("Compared scans base=%s current=%s counts=%s", base.id, current.id, counts.model_dump())

    return ComparisonResult(
        project_id=base.project_id,
        project_name=base.project.name,
        base=ScanRead.model_validate(base),
        compare=ScanRead.model_validate(current),
        reordered=reordered,
        warnings=warnings,
        counts=counts,
        items=items,
    )


def _location_key(item: FindingListItem) -> tuple | None:
    if not item.source_template:
        return None
    return (item.source_tool, item.source_template, item.endpoint or "", item.parameter or "", (item.http_method or "").upper())


def _pair_title_changes(findings: dict[int, FindingListItem], classification: dict[int, Classification]) -> dict[int, int]:
    """Map baseline-only finding -> current-only finding when they differ only by title (unambiguous 1:1)."""
    gone: dict[tuple, list[int]] = {}
    appeared: dict[tuple, list[int]] = {}
    for finding_id, kind in classification.items():
        key = _location_key(findings[finding_id])
        if key is None:
            continue
        if kind == Classification.RESOLVED:
            gone.setdefault(key, []).append(finding_id)
        elif kind in (Classification.NEW, Classification.REOPENED):
            appeared.setdefault(key, []).append(finding_id)
    return {
        gone[key][0]: appeared[key][0]
        for key in gone.keys() & appeared.keys()
        if len(gone[key]) == 1 and len(appeared[key]) == 1
    }


_RANK = {"Critical": 5, "High": 4, "Medium": 3, "Low": 2, "Informational": 1}


def _severity_rank(item: ComparisonItem) -> int:
    severity = item.finding.normalized_severity
    return _RANK.get(severity.value, 0) if severity else 0

