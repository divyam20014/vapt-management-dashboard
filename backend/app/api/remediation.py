from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import remediation_service

router = APIRouter(prefix="/remediation", tags=["remediation"])


class Reference(BaseModel):
    title: str
    url: str


class GuidelineSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    title: str
    category: str
    owasp: str | None
    summary: str
    cwe_ids: list[str]
    findings: int = 0
    active_findings: int = 0


class GuidelineDetail(GuidelineSummary):
    steps: list[str]
    verification: str | None
    references: list[Reference]
    zap_rules: list[str]
    nuclei_rules: list[str]


class Library(BaseModel):
    items: list[GuidelineSummary]
    categories: list[str]
    total: int


def _with_counts(model, guideline, counts):
    return model.model_validate(guideline).model_copy(update=counts.get(guideline.slug, {}))


@router.get("", response_model=Library)
def list_guidelines(
    search: str | None = Query(None, max_length=200),
    category: str | None = Query(None, max_length=100),
    db: Session = Depends(get_db),
):
    """Searchable library of standard remediation guidance, with how many stored findings each one applies to."""
    guidelines = remediation_service.list_guidelines(db, search, category)
    counts = remediation_service.finding_counts(db, guidelines)
    return Library(
        items=[_with_counts(GuidelineSummary, g, counts) for g in guidelines],
        categories=remediation_service.categories(db),
        total=len(guidelines),
    )


@router.get("/{slug}", response_model=GuidelineDetail)
def get_guideline(slug: str, db: Session = Depends(get_db)):
    guideline = remediation_service.get_guideline(db, slug)
    return _with_counts(GuidelineDetail, guideline, remediation_service.finding_counts(db, [guideline]))
