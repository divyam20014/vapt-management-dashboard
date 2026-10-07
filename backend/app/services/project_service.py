import logging
from enum import Enum

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.models import Project, ProjectEnvironment, ProjectStatus, Scan, User
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services import audit_service
from app.services.audit_service import AuditAction

logger = logging.getLogger(__name__)


class ProjectSortField(str, Enum):
    NAME = "name"
    STATUS = "status"
    ENVIRONMENT = "environment"
    CREATED_AT = "created_at"
    UPDATED_AT = "updated_at"


class SortOrder(str, Enum):
    ASC = "asc"
    DESC = "desc"


def _name_taken(db: Session, name: str, exclude_id: int | None = None) -> bool:
    query = select(Project.id).where(func.lower(Project.name) == name.lower())
    if exclude_id is not None:
        query = query.where(Project.id != exclude_id)
    return db.scalar(query) is not None


def _duplicate_name_error(name: str) -> ConflictError:
    return ConflictError(f'A project named "{name}" already exists.', details=[{"field": "name", "message": "Project name must be unique"}])


def list_projects(
    db: Session,
    *,
    page: int,
    page_size: int,
    search: str | None = None,
    status: ProjectStatus | None = None,
    environment: ProjectEnvironment | None = None,
    sort_by: ProjectSortField = ProjectSortField.CREATED_AT,
    sort_order: SortOrder = SortOrder.DESC,
) -> tuple[list[Project], int]:
    query = select(Project)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                Project.name.ilike(pattern),
                Project.application_name.ilike(pattern),
                Project.owner.ilike(pattern),
                Project.description.ilike(pattern),
            )
        )
    if status is not None:
        query = query.where(Project.status == status)
    if environment is not None:
        query = query.where(Project.environment == environment)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0

    column = getattr(Project, sort_by.value)
    ordering = column.asc() if sort_order == SortOrder.ASC else column.desc()
    items = db.scalars(query.order_by(ordering, Project.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return list(items), total


def get_project(db: Session, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise NotFoundError(f"Project {project_id} was not found.")
    return project


def create_project(db: Session, data: ProjectCreate, actor: User | None = None) -> Project:
    if _name_taken(db, data.name):
        raise _duplicate_name_error(data.name)
    project = Project(**data.model_dump())
    db.add(project)
    try:
        db.flush()
        audit_service.record(db, actor, AuditAction.PROJECT_CREATED, "project", project.id, {"name": project.name})
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _duplicate_name_error(data.name) from exc
    db.refresh(project)
    logger.info("Project created id=%s name=%r", project.id, project.name)
    return project


def update_project(db: Session, project_id: int, data: ProjectUpdate, actor: User | None = None) -> Project:
    project = get_project(db, project_id)
    changes = data.model_dump(exclude_unset=True)
    if "name" in changes and _name_taken(db, changes["name"], exclude_id=project_id):
        raise _duplicate_name_error(changes["name"])
    for field, value in changes.items():
        setattr(project, field, value)
    audit_service.record(db, actor, AuditAction.PROJECT_UPDATED, "project", project.id, {"fields": sorted(changes)})
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _duplicate_name_error(changes.get("name", project.name)) from exc
    db.refresh(project)
    logger.info("Project updated id=%s fields=%s", project.id, sorted(changes))
    return project


def delete_project(db: Session, project_id: int, actor: User | None = None) -> None:
    project = get_project(db, project_id)
    scan_count = db.scalar(select(func.count()).select_from(Scan).where(Scan.project_id == project_id)) or 0
    if scan_count:
        raise ConflictError(
            f"This project has {scan_count} uploaded report(s) and cannot be deleted. "
            "Archive it instead to keep its reports and findings."
        )
    db.delete(project)
    audit_service.record(db, actor, AuditAction.PROJECT_DELETED, "project", project_id, {"name": project.name})
    db.commit()
    logger.info("Project deleted id=%s name=%r", project_id, project.name)
