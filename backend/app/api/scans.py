from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.common import Page
from app.schemas.scan import ScanRead, UploadResult
from app.services import scan_service

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
    )


@router.get("/projects/{project_id}/scans", response_model=Page[ScanRead])
def list_project_scans(
    project_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    items, total = scan_service.list_project_scans(db, project_id, page, page_size)
    return Page[ScanRead](items=items, total=total, page=page, page_size=page_size)


@router.get("/scans/{scan_id}", response_model=ScanRead)
def get_scan(scan_id: int, db: Session = Depends(get_db)):
    return scan_service.get_scan(db, scan_id)
