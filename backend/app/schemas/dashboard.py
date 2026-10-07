from pydantic import BaseModel

from app.schemas.project import ProjectRead


class CountByLabel(BaseModel):
    label: str
    count: int


class DashboardSummary(BaseModel):
    """Dashboard metrics derived from SQLite.

    Phase 1 only stores projects; scan and finding metrics are added when those
    tables exist rather than being reported as placeholder values.
    """

    project_count: int
    projects_by_status: list[CountByLabel]
    projects_by_environment: list[CountByLabel]
    recent_projects: list[ProjectRead]
