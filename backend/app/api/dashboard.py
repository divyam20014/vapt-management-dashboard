from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.dashboard import DashboardSummary, ProjectFindings, Trends
from app.schemas.scan import SeverityCounts
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

_PROJECT = Query(None, description="Scope to one project (project dashboard).")


@router.get("/summary", response_model=DashboardSummary)
def get_summary(project_id: int | None = _PROJECT, db: Session = Depends(get_db)):
    return dashboard_service.get_summary(db, project_id)


@router.get("/severity", response_model=SeverityCounts)
def get_severity(project_id: int | None = _PROJECT, active_only: bool = Query(False), db: Session = Depends(get_db)):
    return dashboard_service.severity_counts(db, project_id, active_only)


@router.get("/projects", response_model=list[ProjectFindings])
def get_findings_by_project(limit: int = Query(10, ge=1, le=100), db: Session = Depends(get_db)):
    return dashboard_service.findings_by_project(db, limit)


@router.get("/trends", response_model=Trends)
def get_trends(project_id: int | None = _PROJECT, db: Session = Depends(get_db)):
    return dashboard_service.get_trends(db, project_id)
