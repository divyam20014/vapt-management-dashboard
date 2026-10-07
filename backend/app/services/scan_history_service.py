"""Scan history: listing, detail, chronological neighbours and original report retrieval."""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from enum import Enum
from pathlib import Path

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError, NotFoundError
from app.models import Scan, Scanner, ScanStatus
from app.schemas.scan import ScanDetail, ScanRead
from app.services.project_service import get_project

# When a scan happened: the date inside the report, or the upload time when the report has none.
SCAN_TIME = func.coalesce(Scan.scan_date, Scan.uploaded_at)


class ScanSortField(str, Enum):
    SCAN_TIME = "scan_time"
    UPLOADED_AT = "uploaded_at"
    NAME = "name"
    TOTAL = "total_findings"


class SortOrder(str, Enum):
    ASC = "asc"
    DESC = "desc"


_SORT = {
    ScanSortField.SCAN_TIME: SCAN_TIME,
    ScanSortField.UPLOADED_AT: Scan.uploaded_at,
    ScanSortField.NAME: func.lower(Scan.scan_name),
    ScanSortField.TOTAL: Scan.total_findings,
}


@dataclass
class ScanFilters:
    project_ids: list[int]
    scanners: list[Scanner]
    statuses: list[ScanStatus]
    date_from: date | None = None
    date_to: date | None = None


def scan_time(scan: Scan) -> datetime:
    return scan.scan_date or scan.uploaded_at


def _day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=timezone.utc)


def list_scans(
    db: Session,
    filters: ScanFilters,
    *,
    page: int,
    page_size: int,
    sort_by: ScanSortField = ScanSortField.SCAN_TIME,
    sort_order: SortOrder = SortOrder.DESC,
) -> tuple[list[Scan], int]:
    query = select(Scan)
    if filters.project_ids:
        query = query.where(Scan.project_id.in_(filters.project_ids))
    if filters.scanners:
        query = query.where(Scan.scanner.in_(filters.scanners))
    if filters.statuses:
        query = query.where(Scan.processing_status.in_(filters.statuses))
    if filters.date_from:
        query = query.where(SCAN_TIME >= _day_start(filters.date_from))
    if filters.date_to:
        query = query.where(SCAN_TIME < _day_start(filters.date_to + timedelta(days=1)))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    column = _SORT[sort_by]
    ordering = column.asc() if sort_order == SortOrder.ASC else column.desc()
    tiebreak = Scan.id.asc() if sort_order == SortOrder.ASC else Scan.id.desc()
    items = db.scalars(query.order_by(ordering, tiebreak).offset((page - 1) * page_size).limit(page_size)).all()
    return list(items), total


def list_project_scans(db: Session, project_id: int, page: int, page_size: int) -> tuple[list[Scan], int]:
    get_project(db, project_id)
    return list_scans(db, ScanFilters([project_id], [], []), page=page, page_size=page_size)


def get_scan(db: Session, scan_id: int) -> Scan:
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise NotFoundError(f"Scan {scan_id} was not found.")
    return scan


def earlier_than(scan: Scan):
    """SQL condition: scans that happened before `scan` (ties broken by id)."""
    moment = scan_time(scan)
    return or_(SCAN_TIME < moment, and_(SCAN_TIME == moment, Scan.id < scan.id))


def previous_completed_scan(db: Session, scan: Scan) -> Scan | None:
    return db.scalars(
        select(Scan)
        .where(Scan.project_id == scan.project_id, Scan.processing_status == ScanStatus.COMPLETED, Scan.id != scan.id, earlier_than(scan))
        .order_by(SCAN_TIME.desc(), Scan.id.desc())
        .limit(1)
    ).first()


def next_completed_scan(db: Session, scan: Scan) -> Scan | None:
    moment = scan_time(scan)
    return db.scalars(
        select(Scan)
        .where(
            Scan.project_id == scan.project_id,
            Scan.processing_status == ScanStatus.COMPLETED,
            Scan.id != scan.id,
            or_(SCAN_TIME > moment, and_(SCAN_TIME == moment, Scan.id > scan.id)),
        )
        .order_by(SCAN_TIME.asc(), Scan.id.asc())
        .limit(1)
    ).first()


def get_scan_detail(db: Session, scan_id: int) -> ScanDetail:
    scan = get_scan(db, scan_id)
    previous = previous_completed_scan(db, scan) if scan.processing_status == ScanStatus.COMPLETED else None
    following = next_completed_scan(db, scan) if scan.processing_status == ScanStatus.COMPLETED else None
    return ScanDetail(
        **ScanRead.model_validate(scan).model_dump(),
        previous_scan=ScanRead.model_validate(previous) if previous else None,
        next_scan=ScanRead.model_validate(following) if following else None,
    )


class OriginalReportMissingError(AppError):
    status_code = 410
    code = "original_missing"



def original_report_path(db: Session, settings: Settings, scan_id: int) -> tuple[Path, str]:
    """Absolute path of the stored original and the file name to offer for download."""
    scan = get_scan(db, scan_id)
    root = settings.upload_path.resolve()
    path = (root / scan.stored_file_path).resolve()
    if not path.is_relative_to(root):
        raise NotFoundError("The original report is not available.")
    if not path.is_file():
        raise OriginalReportMissingError("The original report file is no longer present in storage.")
    return path, scan.original_filename
