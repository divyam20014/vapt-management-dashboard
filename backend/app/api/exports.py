from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import require
from app.core.permissions import Permission
from app.api.findings import finding_filters
from app.database import get_db
from app.models import User
from app.services import export_service
from app.services.export_service import ExportFile, ExportFormat
from app.services.finding_service import FindingFilters, FindingSortField, SortOrder

router = APIRouter(prefix="/exports", tags=["exports"])


class SavedExport(BaseModel):
    name: str
    kind: str
    format: str
    size: int
    created_at: datetime


def _download(export: ExportFile) -> FileResponse:
    return FileResponse(
        export.path,
        media_type=export.media_type,
        filename=export.filename,
        headers={"X-Content-Type-Options": "nosniff", "X-Export-Count": str(export.count)},
    )


@router.get("/findings", response_class=FileResponse)
def export_findings(
    request: Request,
    format: ExportFormat = Query(ExportFormat.CSV),
    sort_by: FindingSortField = Query(FindingSortField.SEVERITY),
    sort_order: SortOrder = Query(SortOrder.DESC),
    filters: FindingFilters = Depends(finding_filters),
    db: Session = Depends(get_db),
    actor: User = Depends(require(Permission.EXPORT)),
):
    """Findings matching the same filters as GET /api/findings, as CSV, XLSX or JSON."""
    return _download(export_service.export_findings(db, request.app.state.settings, filters, format, actor, sort_by, sort_order))


@router.get("/projects/{project_id}/report", response_class=FileResponse)
def export_project_report(
    project_id: int, request: Request, db: Session = Depends(get_db), actor: User = Depends(require(Permission.EXPORT))
):
    """Self-contained HTML project report (print to PDF from the browser)."""
    return _download(export_service.project_report(db, request.app.state.settings, project_id, actor))


@router.get("", response_model=list[SavedExport])
def list_saved_exports(request: Request):
    return export_service.list_exports(request.app.state.settings)


@router.get("/files/{name}", response_class=FileResponse)
def download_saved_export(name: str, request: Request):
    return _download(export_service.saved_export(request.app.state.settings, name))
