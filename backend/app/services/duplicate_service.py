"""Potential-duplicate detection. Candidates are recorded for human review and never merged.

A pair is flagged only when the findings come from *different* source tools (a scanner's own
check identity is trusted within that scanner), target the same endpoint (and the same parameter
and method where both reports provide them),
and every key word of one title appears in the other (at least two key words). A shared CWE
raises confidence from Low to Medium; a shared CWE alone is not enough (CWE-693, for example,
covers many unrelated header checks).
"""

import logging
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DuplicateConfidence, Finding, PotentialDuplicate

logger = logging.getLogger(__name__)

MIN_KEY_WORDS = 2
_IN_CLAUSE_CHUNK = 500
# Words that describe the *kind* of problem rather than *which* problem it is.
_GENERIC_WORDS = {
    "a", "an", "and", "by", "for", "in", "is", "of", "on", "or", "the", "to", "not", "no",
    "http", "https", "header", "missing", "security", "set", "invalid", "detect", "detected", "found",
}


def key_words(title: str) -> set[str]:
    words = set()
    for token in re.findall(r"[a-z0-9]+", title.lower()):
        if len(token) > 3 and token.endswith("s"):
            token = token[:-1]  # crude plural folding: headers -> header
        if token not in _GENERIC_WORDS:
            words.add(token)
    return words


def _same_target(a: Finding, b: Finding) -> bool:
    """A value only rules a pair out when both reports provide it and they differ."""
    if a.parameter and b.parameter and a.parameter != b.parameter:
        return False
    if a.http_method and b.http_method and a.http_method.upper() != b.http_method.upper():
        return False
    return True


def assess_pair(a: Finding, b: Finding) -> tuple[DuplicateConfidence, str] | None:
    if a.source_tool == b.source_tool or not _same_target(a, b):
        return None
    words_a, words_b = key_words(a.normalized_title), key_words(b.normalized_title)
    smaller, larger = sorted((words_a, words_b), key=len)
    if len(smaller) < MIN_KEY_WORDS or not smaller <= larger:
        return None
    shared = ", ".join(sorted(smaller))
    if a.cwe and b.cwe and a.cwe == b.cwe:
        return DuplicateConfidence.MEDIUM, f"Same endpoint and {a.cwe}; titles share the key words: {shared}."
    return DuplicateConfidence.LOW, f"Same endpoint; titles share the key words: {shared}."


def detect_potential_duplicates(db: Session, project_id: int, new_findings: list[Finding], scan_id: int) -> list[PotentialDuplicate]:
    endpoints = sorted({finding.endpoint for finding in new_findings if finding.endpoint})
    if not endpoints:
        return []

    by_endpoint: dict[str, list[Finding]] = {}
    for start in range(0, len(endpoints), _IN_CLAUSE_CHUNK):
        chunk = endpoints[start : start + _IN_CLAUSE_CHUNK]
        rows = db.scalars(select(Finding).where(Finding.project_id == project_id, Finding.endpoint.in_(chunk))).all()
        for row in rows:
            by_endpoint.setdefault(row.endpoint, []).append(row)

    new_ids = {finding.id for finding in new_findings}
    seen: set[tuple[int, int]] = set()
    created: list[PotentialDuplicate] = []
    for finding in new_findings:
        for other in by_endpoint.get(finding.endpoint, []):
            pair = (min(finding.id, other.id), max(finding.id, other.id))
            if other.id == finding.id or pair in seen:
                continue
            if other.id in new_ids and other.id < finding.id:
                continue  # pairs of two new findings are evaluated once
            assessment = assess_pair(finding, other)
            if assessment is None:
                continue
            seen.add(pair)
            confidence, reason = assessment
            duplicate = PotentialDuplicate(
                project_id=project_id,
                finding_id=finding.id,
                candidate_finding_id=other.id,
                detected_in_scan_id=scan_id,
                reason=reason,
                confidence=confidence,
            )
            db.add(duplicate)
            created.append(duplicate)
    logger.info("Duplicate detection project=%s new_findings=%d candidates=%d", project_id, len(new_findings), len(created))
    return created
