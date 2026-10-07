"""Upload pipeline: validate → detect → parse → normalize → fingerprint → dedupe → persist."""

import logging
from collections import Counter
from datetime import datetime
from typing import BinaryIO

from sqlalchemy import func, insert, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError, NotFoundError
from app.database.base import utcnow
from app.models import Finding, FindingOccurrence, FindingStatus, FindingStatusHistory, Scan, ScanStatus, Severity, User
from app.parsers.base import NormalizedFinding, ReportFile, ReportParseError, UnsupportedReportError
from app.parsers.normalization import fingerprint
from app.parsers.registry import detect_parser
from app.schemas.scan import BulkUploadResult, PotentialDuplicateRead, ScanRead, SeverityCounts, UploadResult
from app.services import audit_service, duplicate_service, upload_validation
from app.services.audit_service import AuditAction
from app.services.project_service import get_project

logger = logging.getLogger(__name__)

_IN_CLAUSE_CHUNK = 500
_SEVERITY_COLUMNS = {
    Severity.CRITICAL: "critical_count",
    Severity.HIGH: "high_count",
    Severity.MEDIUM: "medium_count",
    Severity.LOW: "low_count",
    Severity.INFORMATIONAL: "informational_count",
}


MAX_BULK_FILES = 25


class DuplicateUploadError(AppError):
    status_code = 409
    code = "duplicate_upload"


class ProcessingFailedError(AppError):
    status_code = 500
    code = "processing_failed"


def _find_previous_upload(db: Session, project_id: int, file_hash: str) -> Scan | None:
    """The latest *completed* scan of the same bytes. A file that previously failed to process can be retried."""
    return db.scalars(
        select(Scan)
        .where(Scan.project_id == project_id, Scan.file_hash == file_hash, Scan.processing_status == ScanStatus.COMPLETED)
        .order_by(Scan.uploaded_at.desc())
        .limit(1)
    ).first()


def _load_existing_findings(db: Session, project_id: int, keys: list[str]) -> dict[str, Finding]:
    existing: dict[str, Finding] = {}
    for start in range(0, len(keys), _IN_CLAUSE_CHUNK):
        chunk = keys[start : start + _IN_CLAUSE_CHUNK]
        for finding in db.scalars(select(Finding).where(Finding.project_id == project_id, Finding.finding_key.in_(chunk))):
            existing[finding.finding_key] = finding
    return existing


def _new_finding_values(project_id: int, scan_id: int, key: str, nf: NormalizedFinding, observed_at: datetime) -> dict:
    """Column values for a new finding (inserted in bulk)."""
    return dict(
        project_id=project_id,
        scan_id=scan_id,
        finding_key=key,
        original_title=nf.original_title,
        normalized_title=nf.normalized_title,
        original_severity=nf.original_severity,
        normalized_severity=nf.normalized_severity,
        category=nf.category,
        subcategory=nf.subcategory,
        description=nf.description,
        impact=nf.impact,
        recommendation=nf.recommendation,
        affected_url=nf.affected_url,
        endpoint=nf.endpoint,
        parameter=nf.parameter,
        http_method=nf.http_method,
        evidence=nf.evidence,
        steps_to_reproduce=nf.steps_to_reproduce,
        source_tool=nf.source_tool,
        source_template=nf.source_template,
        source_reference=nf.source_reference,
        cwe=nf.cwe,
        owasp=nf.owasp,
        cvss_score=nf.cvss_score,
        source_metadata=nf.source_metadata or None,
        status=nf.initial_status or FindingStatus.OPEN,
        first_detected=observed_at,
        last_detected=observed_at,
    )


def _save_failed(db, project, scan_name, name, stored, file_hash, parser, uploaded_at, actor) -> "ProcessingFailedError":
    """After a rolled-back save: record a Failed scan that keeps the original file (or delete the file if even that fails)."""
    try:
        failed = _record_failed_scan(
            db, project_id=project.id, scan_name=scan_name, filename=name, stored_path=stored.relative_path,
            file_hash=file_hash, message="An error occurred while saving the findings. No findings were saved.",
            parser=parser, uploaded_at=uploaded_at, actor=actor,
        )
        details = {"scan_id": failed.id}
    except SQLAlchemyError:
        db.rollback()
        stored.absolute_path.unlink(missing_ok=True)  # nothing references the file
        details = None
    return ProcessingFailedError("The report was parsed but could not be saved. No findings were stored.", details=details)


def _record_failed_scan(
    db: Session, *, project_id: int, scan_name: str, filename: str, stored_path: str, file_hash: str,
    message: str, parser=None, uploaded_at: datetime, actor: User | None = None,
) -> Scan:
    scan = Scan(
        project_id=project_id,
        scan_name=scan_name,
        scanner=parser.scanner if parser else None,
        report_type=parser.report_type if parser else None,
        original_filename=filename,
        stored_file_path=stored_path,
        file_hash=file_hash,
        uploaded_at=uploaded_at,
        processing_status=ScanStatus.FAILED,
        processing_error=message,
    )
    db.add(scan)
    db.flush()
    audit_service.record(
        db, actor, AuditAction.REPORT_FAILED, "scan", scan.id, {"project_id": project_id, "file": filename, "reason": message},
        project_id=project_id,
    )
    db.commit()
    db.refresh(scan)
    logger.warning("Scan recorded as failed id=%s project=%s reason=%s", scan.id, project_id, message)
    return scan


def process_upload(
    db: Session,
    settings: Settings,
    *,
    project_id: int,
    filename: str | None,
    content_type: str | None,
    stream: BinaryIO,
    scan_name: str | None = None,
    provided_scan_date: datetime | None = None,
    allow_duplicate: bool = False,
    actor: User | None = None,
) -> UploadResult:
    project = get_project(db, project_id)

    # 1. Validate the file itself. Nothing is stored if this fails.
    name, extension = upload_validation.validate_filename(filename)
    upload_validation.validate_content_type(content_type, extension)
    content = upload_validation.read_limited(stream, settings.max_upload_size_mb * 1024 * 1024)
    upload_validation.validate_content(content, extension)
    file_hash = upload_validation.sha256_hex(content)
    logger.info("Upload received project=%s file=%r bytes=%d sha256=%s", project.id, name, len(content), file_hash[:12])

    # 2. Duplicate upload check (same bytes already uploaded to this project).
    previous = _find_previous_upload(db, project.id, file_hash)
    if previous is not None and not allow_duplicate:
        logger.info("Duplicate upload detected project=%s previous_scan=%s", project.id, previous.id)
        raise DuplicateUploadError(
            "This report has already been uploaded to this project.",
            details={"existing_scan": ScanRead.model_validate(previous).model_dump(mode="json")},
        )

    # 3. Detect, parse and normalize entirely in memory.
    report = ReportFile(filename=name, extension=extension, content=content)
    parser = None
    error: AppError | None = None
    normalized: list[NormalizedFinding] = []
    parsed = None
    try:
        parser = detect_parser(report)
        logger.info("Parser selected file=%r parser=%s", name, parser.name)
        parsed = parser.parse(report)
        normalized = [parser.normalize(record) for record in parsed.records]
        logger.info("Parsed file=%r records=%d", name, len(normalized))
    except (ReportParseError, UnsupportedReportError) as exc:
        error = exc
    except Exception:  # unexpected structure inside a recognised report
        logger.exception("Parser failure file=%r parser=%s", name, parser.name if parser else None)
        error = ReportParseError(
            f"The {parser.name if parser else 'report'} file could not be parsed because its structure is not as expected."
        )

    uploaded_at = utcnow()
    stored = upload_validation.store_original(settings.upload_path, project.id, name, content, uploaded_at)
    scan_name = (scan_name or "").strip() or name

    if error is not None:
        failed = _record_failed_scan(
            db, project_id=project.id, scan_name=scan_name, filename=name, stored_path=stored.relative_path,
            file_hash=file_hash, message=error.message, parser=parser, uploaded_at=uploaded_at, actor=actor,
        )
        error.details = {"scan_id": failed.id}
        raise error

    assert parser is not None and parsed is not None
    warnings = list(parsed.warnings)
    scan_date = parsed.scan_date or provided_scan_date
    if parsed.scan_date and provided_scan_date and parsed.scan_date.date() != provided_scan_date.date():
        warnings.append("The scan date in the report was used; the date entered on upload was ignored.")
    observed_at = scan_date or uploaded_at

    # 4. Persist scan, findings and occurrences in one transaction.
    try:
        scan = Scan(
            project_id=project.id,
            scan_name=scan_name,
            scanner=parser.scanner,
            report_type=parser.report_type,
            original_filename=name,
            stored_file_path=stored.relative_path,
            file_hash=file_hash,
            scan_date=scan_date,
            uploaded_at=uploaded_at,
            processing_status=ScanStatus.COMPLETED,
        )
        db.add(scan)
        db.flush()

        keyed = [
            (fingerprint(project.id, nf.source_tool, nf.identity, nf.endpoint, nf.parameter, nf.identity_method), nf)
            for nf in normalized
        ]
        findings_by_key = _load_existing_findings(db, project.id, sorted({key for key, _ in keyed}))
        preexisting_keys = set(findings_by_key)

        # Existing findings: extend their detection window. New findings: one bulk INSERT (the first
        # record of a key in the report defines it), then load them back as ORM objects.
        pending: dict[str, dict] = {}
        for key, nf in keyed:
            finding = findings_by_key.get(key)
            if finding is not None:
                finding.first_detected = min(finding.first_detected, observed_at)
                finding.last_detected = max(finding.last_detected, observed_at)
            elif key not in pending:
                pending[key] = _new_finding_values(project.id, scan.id, key, nf, observed_at)
        new_findings: list[Finding] = []
        if pending:
            # Plain executemany (batched); keys are unique per project, so the rows are read back by key.
            db.execute(insert(Finding), list(pending.values()))
            created = _load_existing_findings(db, project.id, list(pending))
            new_findings = [created[key] for key in pending]
            findings_by_key.update(created)
        in_this_scan: dict[str, Finding] = {key: findings_by_key[key] for key, _ in keyed}

        # Every record in the report is kept as an occurrence, verbatim (bulk INSERT).
        occurrences = [
            dict(
                finding_id=findings_by_key[key].id,
                scan_id=scan.id,
                original_title=nf.original_title,
                original_severity=nf.original_severity,
                affected_url=nf.affected_url,
                parameter=nf.parameter,
                http_method=nf.http_method,
                evidence=nf.evidence,
                raw_record=nf.raw_record,
            )
            for key, nf in keyed
        ]
        if occurrences:  # an empty list would run one empty INSERT
            db.execute(insert(FindingOccurrence), occurrences)

        severities = Counter(finding.normalized_severity for finding in in_this_scan.values())
        scan.total_findings = len(in_this_scan)
        for severity, column in _SEVERITY_COLUMNS.items():
            setattr(scan, column, severities.get(severity, 0))

        db.flush()
        # The timeline of every new finding starts with its detection (bulk INSERT).
        history = []
        for finding in new_findings:
            reported = (finding.source_metadata or {}).get("reported_status")
            from_report = f' Status "{reported}" taken from the report.' if finding.status != FindingStatus.OPEN else ""
            history.append(dict(
                finding_id=finding.id,
                old_status=None,
                new_status=finding.status,
                changed_by=actor.id if actor else None,
                changed_at=uploaded_at,
                comment=f'Detected in scan "{scan_name}" (#{scan.id}).{from_report}',
            ))
        if history:
            db.execute(insert(FindingStatusHistory), history)
        duplicates = duplicate_service.detect_potential_duplicates(db, project.id, new_findings, scan.id)
        audit_service.record(
            db, actor, AuditAction.REPORT_UPLOADED, "scan", scan.id,
            {"project_id": project.id, "file": name, "parser": parser.name, "findings": len(in_this_scan),
             "new_findings": len(new_findings), "potential_duplicates": len(duplicates), "allow_duplicate": allow_duplicate},
            project_id=project.id,
        )
        if previous is not None:
            # The user was warned that identical bytes were uploaded before and chose to continue.
            audit_service.record(
                db, actor, AuditAction.REPORT_DUPLICATE_ACCEPTED, "scan", scan.id,
                {"file": name, "previous_scan_id": previous.id}, project_id=project.id,
            )
        db.commit()
    except IntegrityError:
        db.rollback()
        # The same file finished uploading in another request meanwhile: report it as the duplicate it is.
        concurrent = _find_previous_upload(db, project.id, file_hash)
        if concurrent is not None and not allow_duplicate:
            stored.absolute_path.unlink(missing_ok=True)
            raise DuplicateUploadError(
                "This report has already been uploaded to this project.",
                details={"existing_scan": ScanRead.model_validate(concurrent).model_dump(mode="json")},
            )
        logger.exception("Integrity error while saving scan project=%s file=%r", project.id, name)
        raise _save_failed(db, project, scan_name, name, stored, file_hash, parser, uploaded_at, actor)
    except Exception:
        # Any failure (database or otherwise) rolls back everything and records a Failed scan.
        db.rollback()
        logger.exception("Error while saving scan project=%s file=%r", project.id, name)
        raise _save_failed(db, project, scan_name, name, stored, file_hash, parser, uploaded_at, actor)

    db.refresh(scan)
    existing_count = len(set(in_this_scan) & preexisting_keys)
    logger.info(
        "Scan saved id=%s project=%s findings=%d new=%d existing=%d duplicates=%d",
        scan.id, project.id, scan.total_findings, len(new_findings), existing_count, len(duplicates),
    )

    findings_by_id = {finding.id: finding for finding in findings_by_key.values()}
    missing_ids = {d.candidate_finding_id for d in duplicates} - set(findings_by_id)
    if missing_ids:
        for finding in db.scalars(select(Finding).where(Finding.id.in_(missing_ids))):
            findings_by_id[finding.id] = finding

    return UploadResult(
        scan=ScanRead.model_validate(scan),
        parser=parser.name,
        records_parsed=len(normalized),
        new_findings=len(new_findings),
        existing_findings=existing_count,
        severity_counts=SeverityCounts(
            critical=scan.critical_count,
            high=scan.high_count,
            medium=scan.medium_count,
            low=scan.low_count,
            informational=scan.informational_count,
            unclassified=severities.get(None, 0),
        ),
        potential_duplicates=[
            PotentialDuplicateRead(
                finding_id=d.finding_id,
                finding_title=findings_by_id[d.finding_id].normalized_title,
                finding_source=findings_by_id[d.finding_id].source_tool,
                candidate_finding_id=d.candidate_finding_id,
                candidate_title=findings_by_id[d.candidate_finding_id].normalized_title,
                candidate_source=findings_by_id[d.candidate_finding_id].source_tool,
                endpoint=findings_by_id[d.finding_id].endpoint,
                reason=d.reason,
                confidence=d.confidence,
            )
            for d in duplicates
        ],
        warnings=warnings,
    )


def process_bulk_upload(
    db: Session,
    settings: Settings,
    *,
    project_id: int,
    files: list[tuple[str | None, str | None, BinaryIO]],
    allow_duplicates: bool = False,
    actor: User | None = None,
) -> BulkUploadResult:
    """Run every file through process_upload independently; one bad file never blocks the others."""
    from app.schemas.scan import BulkFileResult

    project = get_project(db, project_id)
    if not files:
        raise AppError("Select at least one report.")
    if len(files) > MAX_BULK_FILES:
        raise AppError(f"Upload at most {MAX_BULK_FILES} reports at a time.")

    results: list[BulkFileResult] = []
    for filename, content_type, stream in files:
        name = filename or "(unnamed)"
        try:
            result = process_upload(
                db, settings, project_id=project.id, filename=filename, content_type=content_type, stream=stream,
                allow_duplicate=allow_duplicates, actor=actor,
            )
            results.append(BulkFileResult(
                filename=name, outcome="created", message=None, scan=result.scan,
                records_parsed=result.records_parsed, new_findings=result.new_findings, warnings=result.warnings,
            ))
        except DuplicateUploadError as exc:
            existing = (exc.details or {}).get("existing_scan") or {}
            results.append(BulkFileResult(
                filename=name, outcome="duplicate", scan=None,
                message=f'Already uploaded as "{existing.get("scan_name", "an earlier scan")}"; skipped.',
            ))
        except AppError as exc:
            scan_id = exc.details.get("scan_id") if isinstance(exc.details, dict) else None
            scan = db.get(Scan, scan_id) if scan_id else None
            results.append(BulkFileResult(
                filename=name, outcome="failed" if scan else "rejected", message=exc.message,
                scan=ScanRead.model_validate(scan) if scan else None,
            ))
        except Exception:  # unexpected: keep going with the remaining files
            db.rollback()
            logger.exception("Bulk upload: unexpected error for file=%r", name)
            results.append(BulkFileResult(filename=name, outcome="rejected", scan=None,
                                          message="An unexpected error occurred while processing this file."))

    succeeded = sum(r.outcome == "created" for r in results)
    duplicates = sum(r.outcome == "duplicate" for r in results)
    summary = BulkUploadResult(
        project_id=project.id,
        total=len(results),
        succeeded=succeeded,
        failed=len(results) - succeeded - duplicates,
        duplicates=duplicates,
        findings_added=sum(r.new_findings for r in results),
        results=results,
    )
    audit_service.record(
        db, actor, AuditAction.REPORTS_BULK_UPLOADED, "project", project.id,
        {k: v for k, v in summary.model_dump().items() if k != "results"} | {"files": [r.filename for r in results]},
    )
    db.commit()
    logger.info("Bulk upload project=%s total=%d succeeded=%d failed=%d duplicates=%d",
                project.id, summary.total, summary.succeeded, summary.failed, summary.duplicates)
    return summary
