from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Project
from app.schemas.dashboard import CountByLabel, DashboardSummary
from app.schemas.project import ProjectRead

RECENT_PROJECT_LIMIT = 5
NOT_SET_LABEL = "Not Set"


def _count_by(db: Session, column) -> list[CountByLabel]:
    rows = db.execute(select(column, func.count()).group_by(column).order_by(func.count().desc())).all()
    return [
        CountByLabel(label=value.value if value is not None else NOT_SET_LABEL, count=count)
        for value, count in rows
    ]


def get_summary(db: Session) -> DashboardSummary:
    project_count = db.scalar(select(func.count()).select_from(Project)) or 0
    recent = db.scalars(
        select(Project).order_by(Project.created_at.desc(), Project.id.desc()).limit(RECENT_PROJECT_LIMIT)
    ).all()
    return DashboardSummary(
        project_count=project_count,
        projects_by_status=_count_by(db, Project.status),
        projects_by_environment=_count_by(db, Project.environment),
        recent_projects=[ProjectRead.model_validate(project) for project in recent],
    )
