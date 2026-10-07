"""Standard remediation guidance: the library, and which guideline applies to a finding.

A finding is linked to a guideline only by an exact rule, in this order:
1. Scanner rule: the finding's own check identifier (OWASP ZAP alert ID, or Nuclei template ID,
   optionally with its matcher) is listed by exactly one guideline.
2. CWE: only when no scanner rule matched, and the finding's CWE is listed by a guideline (each
   CWE belongs to one guideline at most, and broad CWEs are never listed).
Titles are never compared. Without an exact rule the finding simply has no standard guidance.

The same rules are applied in Python (finding detail) and in SQL (findings filter / counts).
"""

import logging
from dataclasses import dataclass

from sqlalchemy import Select, String, and_, cast, false, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models import Finding, FindingStatus, RemediationGuideline, Scanner
from app.remediation.library import GUIDELINES

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = (FindingStatus.OPEN, FindingStatus.IN_PROGRESS, FindingStatus.REOPENED)
ZAP = Scanner.ZAP.value
NUCLEI = Scanner.NUCLEI.value


def sync_builtin_library(db: Session) -> None:
    """Insert/update the built-in guidelines and remove ones no longer shipped (idempotent)."""
    existing = {g.slug: g for g in db.scalars(select(RemediationGuideline))}
    shipped = set()
    for item in GUIDELINES:
        shipped.add(item["slug"])
        values = {
            "title": item["title"], "category": item["category"], "owasp": item.get("owasp"), "summary": item["summary"],
            "steps": item["steps"], "verification": item.get("verification"), "references": item["references"],
            "cwe_ids": item["cwe"], "zap_rules": item["zap"], "nuclei_rules": item["nuclei"],
        }
        guideline = existing.get(item["slug"])
        if guideline is None:
            db.add(RemediationGuideline(slug=item["slug"], **values))
        else:
            for key, value in values.items():
                if getattr(guideline, key) != value:
                    setattr(guideline, key, value)
    for slug, guideline in existing.items():
        if slug not in shipped:
            db.delete(guideline)
    db.commit()
    logger.info("Remediation library ready (%d guidelines)", len(shipped))


# --- Matching (Python) ----------------------------------------------------------------------------

@dataclass(frozen=True)
class GuidanceMatch:
    guideline: RemediationGuideline
    match_type: str  # "scanner_rule" | "cwe"
    basis: str       # human-readable reason, e.g. "OWASP ZAP alert 10038"


class LibraryIndex:
    def __init__(self, guidelines: list[RemediationGuideline]):
        self.zap: dict[str, RemediationGuideline] = {}
        self.nuclei: dict[str, RemediationGuideline] = {}
        self.cwe: dict[str, RemediationGuideline] = {}
        for g in guidelines:
            for rule in g.zap_rules:
                self.zap[rule] = g
            for rule in g.nuclei_rules:
                self.nuclei[rule] = g
            for cwe in g.cwe_ids:
                self.cwe[cwe] = g

    @classmethod
    def load(cls, db: Session) -> "LibraryIndex":
        return cls(list(db.scalars(select(RemediationGuideline))))


def cwe_tokens(value: str | None) -> list[str]:
    """Stored CWE values are 'CWE-n' joined with ', ' by every parser."""
    return [token for token in (value or "").split(", ") if token]


def match_finding(finding: Finding, index: LibraryIndex) -> list[GuidanceMatch]:
    template = finding.source_template or ""
    if finding.source_tool == ZAP and template in index.zap:
        return [GuidanceMatch(index.zap[template], "scanner_rule", f"OWASP ZAP alert {template}")]
    if finding.source_tool == NUCLEI and template:
        matcher = (finding.source_metadata or {}).get("matcher_name")
        if matcher and f"{template}:{matcher}" in index.nuclei:
            return [GuidanceMatch(index.nuclei[f"{template}:{matcher}"], "scanner_rule", f"Nuclei template {template} ({matcher})")]
        if template in index.nuclei:
            return [GuidanceMatch(index.nuclei[template], "scanner_rule", f"Nuclei template {template}")]
    matches: dict[str, GuidanceMatch] = {}
    for cwe in cwe_tokens(finding.cwe):
        guideline = index.cwe.get(cwe)
        if guideline is not None and guideline.slug not in matches:
            matches[guideline.slug] = GuidanceMatch(guideline, "cwe", cwe)
    return list(matches.values())


# --- Matching (SQL) ---------------------------------------------------------------------------------

def _rule_condition(guidelines: list[RemediationGuideline]):
    zap = [rule for g in guidelines for rule in g.zap_rules]
    nuclei = [rule for g in guidelines for rule in g.nuclei_rules]
    plain = [rule for rule in nuclei if ":" not in rule]
    with_matcher = [rule.split(":", 1) for rule in nuclei if ":" in rule]
    matcher = func.json_extract(Finding.source_metadata, "$.matcher_name")
    nuclei_conditions = []
    if plain:
        # A template never has both template-level and matcher-level rules (tested), so these cannot overlap.
        nuclei_conditions.append(Finding.source_template.in_(plain))
    nuclei_conditions += [and_(Finding.source_template == t, matcher == m) for t, m in with_matcher]
    parts = []
    if zap:
        parts.append(and_(Finding.source_tool == ZAP, Finding.source_template.in_(zap)))
    if nuclei_conditions:
        parts.append(and_(Finding.source_tool == NUCLEI, or_(*nuclei_conditions)))
    return or_(*parts) if parts else false()


def _cwe_condition(cwes: list[str]):
    if not cwes:
        return false()
    padded = ", " + func.coalesce(Finding.cwe, "") + ","
    return or_(*[padded.like(f"%, {cwe},%") for cwe in cwes])


def guideline_condition(db: Session, slug: str):
    """SQL condition: findings this guideline applies to (same precedence as match_finding)."""
    guidelines = list(db.scalars(select(RemediationGuideline)))
    target = next((g for g in guidelines if g.slug == slug), None)
    if target is None:
        raise NotFoundError(f'Remediation guideline "{slug}" was not found.')
    return or_(
        _rule_condition([target]),
        and_(~_rule_condition(guidelines), _cwe_condition(target.cwe_ids)),
    )


# --- Library API -------------------------------------------------------------------------------------

def _search(query: Select, search: str | None, category: str | None) -> Select:
    if category:
        query = query.where(RemediationGuideline.category == category)
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.where(or_(
            func.lower(RemediationGuideline.title).like(term),
            func.lower(RemediationGuideline.summary).like(term),
            func.lower(RemediationGuideline.category).like(term),
            func.lower(func.coalesce(RemediationGuideline.owasp, "")).like(term),
            func.lower(cast(RemediationGuideline.cwe_ids, String)).like(term),
            func.lower(cast(RemediationGuideline.zap_rules, String)).like(term),
            func.lower(cast(RemediationGuideline.nuclei_rules, String)).like(term),
            func.lower(cast(RemediationGuideline.steps, String)).like(term),
        ))
    return query


def list_guidelines(db: Session, search: str | None, category: str | None) -> list[RemediationGuideline]:
    """The library is small (tens of records), so it is returned whole, sorted by category and title."""
    query = _search(select(RemediationGuideline), search, category)
    return list(db.scalars(query.order_by(RemediationGuideline.category, RemediationGuideline.title)))


def categories(db: Session) -> list[str]:
    return list(db.scalars(select(RemediationGuideline.category).distinct().order_by(RemediationGuideline.category)))


def get_guideline(db: Session, slug: str) -> RemediationGuideline:
    guideline = db.scalar(select(RemediationGuideline).where(RemediationGuideline.slug == slug))
    if guideline is None:
        raise NotFoundError(f'Remediation guideline "{slug}" was not found.')
    return guideline


def finding_counts(db: Session, guidelines: list[RemediationGuideline]) -> dict[str, dict[str, int]]:
    """Per guideline: all linked findings and the active (Open/In Progress/Reopened) ones, in one query."""
    if not guidelines:
        return {}
    every = list(db.scalars(select(RemediationGuideline)))
    any_rule = _rule_condition(every)
    active = Finding.status.in_(ACTIVE_STATUSES)
    columns = []
    for g in guidelines:
        condition = or_(_rule_condition([g]), and_(~any_rule, _cwe_condition(g.cwe_ids)))
        columns += [func.count(Finding.id).filter(condition), func.count(Finding.id).filter(and_(condition, active))]
    row = db.execute(select(*columns)).one()
    return {g.slug: {"findings": row[2 * i], "active_findings": row[2 * i + 1]} for i, g in enumerate(guidelines)}
