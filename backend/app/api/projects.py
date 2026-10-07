from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ProjectEnvironment, ProjectStatus
from app.schemas.common import Page
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate
from app.services import project_service
from app.services.project_service import ProjectSortField, SortOrder

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=Page[ProjectRead])
def list_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, max_length=200),
    status_filter: ProjectStatus | None = Query(None, alias="status"),
    environment: ProjectEnvironment | None = Query(None),
    sort_by: ProjectSortField = Query(ProjectSortField.CREATED_AT),
    sort_order: SortOrder = Query(SortOrder.DESC),
    db: Session = Depends(get_db),
):
    items, total = project_service.list_projects(
        db,
        page=page,
        page_size=page_size,
        search=search,
        status=status_filter,
        environment=environment,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return Page[ProjectRead](items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
    return project_service.create_project(db, data)


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(project_id: int, db: Session = Depends(get_db)):
    return project_service.get_project(db, project_id)


@router.put("/{project_id}", response_model=ProjectRead)
def update_project(project_id: int, data: ProjectUpdate, db: Session = Depends(get_db)):
    return project_service.update_project(db, project_id, data)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: Session = Depends(get_db)) -> Response:
    project_service.delete_project(db, project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
