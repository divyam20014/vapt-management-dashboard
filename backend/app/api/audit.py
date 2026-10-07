from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import require
from app.core.errors import AppError
from app.core.permissions import Permission
from app.database import get_db
from app.schemas.common import Page
from app.services import audit_service
from app.services.audit_service import AuditFilters

router = APIRouter(prefix="/audit-logs", tags=["audit"], dependencies=[Depends(require(Permission.AUDIT_READ))])


class AuditUser(BaseModel):
    id: int
    name: str | None


class AuditProject(BaseModel):
    id: int
    name: str | None  # None when the project no longer exists


class AuditFinding(BaseModel):
    id: int
    title: str | None


class AuditEntry(BaseModel):
    id: int
    timestamp: datetime
    action: str
    action_label: str
    entity_type: str
    entity_id: int | None
    user: AuditUser | None
    project: AuditProject | None
    finding: AuditFinding | None
    details: dict[str, Any] | None


class AuditActionOption(BaseModel):
    code: str
    label: str


@router.get("", response_model=Page[AuditEntry])
def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user_id: int | None = Query(None),
    action: list[str] = Query(default=[]),
    project_id: int | None = Query(None),
    finding_id: int | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: Session = Depends(get_db),
):
    """Newest first. Admin only."""
    if date_from and date_to and date_from > date_to:
        raise AppError("date_from must be on or before date_to.")
    filters = AuditFilters(user_id=user_id, actions=action, project_id=project_id, finding_id=finding_id, date_from=date_from, date_to=date_to)
    items, total = audit_service.list_entries(db, filters, page, page_size)
    return Page[AuditEntry](items=items, total=total, page=page, page_size=page_size)


@router.get("/actions", response_model=list[AuditActionOption])
def list_audit_actions(db: Session = Depends(get_db)):
    return audit_service.action_catalog(db)
