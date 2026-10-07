from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_acting_user
from app.database import get_db
from app.models import Scanner, ScanStatus, User
from app.schemas.common import Page
from app.schemas.comparison import ComparisonResult
from app.schemas.scan import ScanDetail, ScanRead, UploadResult
from app.services import comparison_service, scan_history_service, scan_service
from app.services.scan_history_service import ScanFilters, ScanSortField, SortOrder

router = APIRouter(tags=["scans"])


@router.post("/scans/upload", response_model=UploadResult, status_code=status.HTTP_201_CREATED)
def upload_report(
    request: Request,
    project_id: int = Form(..., gt=0),
    file: UploadFile = File(...),
    scan_name: str | None = Form(None, max_length=255),
    scan_date: date | None = Form(None, description="Used only when the report itself has no scan date."),
    allow_duplicate: bool = Form(False, description="Process the file even if identical bytes were uploaded before."),
    db: Session = Depends(get_db),
    actor: User | None = Depends(get_acting_user),
):
    provided = datetime.combine(scan_date, time.min, tzinfo=timezone.utc) if scan_date else None
    return scan_service.process_upload(
        db,
        request.app.state.settings,
        project_id=project_id,
        filename=file.filename,
        content_type=file.content_type,
        stream=file.file,
        scan_name=scan_name,
        provided_scan_date=provided,
        allow_duplicate=allow_duplicate,
        actor=actor,
    )


@router.get("/scans", response_model=Page[ScanRead])
def list_scans(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    project_id: list[int] = Query(default=[]),
    scanner: list[Scanner] = Query(default=[]),
    processing_status: list[ScanStatus] = Query(default=[], alias="status"),
    date_from: date | None = Query(None, description="Scan date (or upload date when the report has none) on/after."),
    date_to: date | None = Query(None),
    sort_by: ScanSortField = Query(ScanSortField.SCAN_TIME),
    sort_order: SortOrder = Query(SortOrder.DESC),
    db: Session = Depends(get_db),
):
    filters = ScanFilters(project_ids=project_id, scanners=scanner, statuses=processing_status, date_from=date_from, date_to=date_to)
    items, total = scan_history_service.list_scans(db, filters, page=page, page_size=page_size, sort_by=sort_by, sort_order=sort_order)
    return Page[ScanRead](items=items, total=total, page=page, page_size=page_size)


@router.get("/scans/compare", response_model=ComparisonResult)
def compare_scans(
    base_scan_id: int = Query(..., description="Baseline (previous) scan."),
    compare_scan_id: int = Query(..., description="Current scan."),
    db: Session = Depends(get_db),
    actor: User | None = Depends(get_acting_user),
):
    return comparison_service.compare_scans(db, base_scan_id, compare_scan_id, actor)


@router.get("/projects/{project_id}/scans", response_model=Page[ScanRead])
def list_project_scans(
    project_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    items, total = scan_history_service.list_project_scans(db, project_id, page, page_size)
    return Page[ScanRead](items=items, total=total, page=page, page_size=page_size)


@router.get("/scans/{scan_id}", response_model=ScanDetail)
def get_scan(scan_id: int, db: Session = Depends(get_db)):
    return scan_history_service.get_scan_detail(db, scan_id)


@router.get("/scans/{scan_id}/original", response_class=FileResponse)
def download_original(scan_id: int, request: Request, db: Session = Depends(get_db)):
    """The uploaded report exactly as received. Always served as a download, never rendered."""
    path, filename = scan_history_service.original_report_path(db, request.app.state.settings, scan_id)
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=filename,
        headers={"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox"},
    )
