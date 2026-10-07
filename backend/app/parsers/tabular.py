"""Column mapping for tabular reports (CSV, XLSX, generic JSON, tables inside PDFs).

Headers are matched only against explicit synonym lists, never by fuzzy similarity. Weak synonyms
(generic words such as "Name" or "Type") are used only when no strong synonym is present. Two
columns that claim the same field with equal strength are an error, not a guess.
"""

import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from app.models.enums import FindingStatus
from app.parsers.base import NormalizedFinding, ReportParseError
from app.parsers.normalization import clean, endpoint_from_url, format_cwe, normalize_severity, normalize_title

IMPORTED_SOURCE = "Imported report"
HEADER_SEARCH_ROWS = 20

# field -> (strong synonyms, weak synonyms); compared after _norm_header()
SYNONYMS: dict[str, tuple[set[str], set[str]]] = {
    "title": (
        {"title", "finding", "finding title", "finding name", "vulnerability", "vulnerability name", "vulnerability title",
         "issue", "issue title", "issue name", "alert", "alert name", "observation", "observation title"},
        {"name", "summary"},
    ),
    "severity": (
        {"severity", "risk", "risk level", "risk rating", "severity level", "severity rating", "criticality", "risk severity"},
        {"rating"},
    ),
    "description": ({"description", "details", "finding description", "vulnerability description", "issue description",
                     "observation details", "issue details", "vulnerability details"}, set()),
    "impact": ({"impact", "business impact", "risk impact", "potential impact"}, set()),
    "affected_url": ({"url", "affected url", "uri", "affected uri", "target url", "affected urls", "vulnerable url"}, set()),
    "endpoint": ({"endpoint", "affected endpoint", "api endpoint", "affected path", "path"}, {"location"}),
    "parameter": ({"parameter", "param", "affected parameter", "vulnerable parameter", "parameter name"}, set()),
    "http_method": ({"method", "http method", "request method"}, set()),
    "evidence": ({"evidence", "proof", "proof of concept", "poc", "evidence details", "proof of concept poc"}, set()),
    "steps_to_reproduce": ({"steps to reproduce", "reproduction steps", "how to reproduce", "replication steps", "steps to replicate"}, set()),
    "recommendation": ({"recommendation", "recommendations", "remediation", "solution", "mitigation", "remediation steps",
                        "suggested fix", "remediation recommendation"}, {"fix"}),
    "status": ({"status", "finding status", "remediation status"}, {"state"}),
    "cwe": ({"cwe", "cwe id", "cweid", "cwe ids"}, set()),
    "owasp": ({"owasp", "owasp category", "owasp top 10", "owasp top ten"}, set()),
    "cvss_score": ({"cvss", "cvss score", "cvss base score", "cvss v3", "cvss v3 score", "cvss3 score", "cvss 3 1 score"}, set()),
    "category": ({"category", "vulnerability category", "vulnerability type", "issue type", "finding type"}, {"type"}),
    "source_reference": ({"references", "reference", "reference links"}, {"links"}),
    "source_tool": ({"tool", "scanner", "source tool", "detected by", "scanner name"}, {"source"}),
}
_STATUS_BY_NAME = {status.value.lower(): status for status in FindingStatus}


def _norm_header(value: Any) -> str:
    text = re.sub(r"[^a-z0-9]+", " ", str(value or "").lower())
    return " ".join(text.split())


def cell_text(value: Any) -> str | None:
    """Spreadsheet/JSON cell -> text, without reformatting the content."""
    if value is None:
        return None
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        parts = [cell_text(item) for item in value]
        return "\n".join(part for part in parts if part) or None
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    return clean(str(value))


@dataclass
class ColumnMapping:
    columns: dict[str, int]  # field -> column index
    headers: list[str]  # original header texts
    unmapped: list[str] = field(default_factory=list)
    ignored_weak: list[str] = field(default_factory=list)

    @property
    def keys(self) -> list[str]:
        """Unique, readable key per column for the stored original record."""
        seen: dict[str, int] = {}
        keys = []
        for index, header in enumerate(self.headers):
            base = header.strip() or f"Column {index + 1}"
            seen[base] = seen.get(base, 0) + 1
            keys.append(base if seen[base] == 1 else f"{base} ({seen[base]})")
        return keys

    @property
    def mapped_fields(self) -> set[str]:
        return set(self.columns)


def map_columns(headers: list[Any]) -> ColumnMapping:
    """Map header cells to fields. Raises ReportParseError on ambiguity."""
    texts = [cell_text(h) or "" for h in headers]
    candidates: dict[str, dict[str, list[int]]] = {}
    for index, text in enumerate(texts):
        key = _norm_header(text)
        if not key:
            continue
        for field_name, (strong, weak) in SYNONYMS.items():
            if key in strong:
                candidates.setdefault(field_name, {"strong": [], "weak": []})["strong"].append(index)
            elif key in weak:
                candidates.setdefault(field_name, {"strong": [], "weak": []})["weak"].append(index)

    columns: dict[str, int] = {}
    ignored_weak: list[str] = []
    for field_name, found in candidates.items():
        chosen = found["strong"] or found["weak"]
        if len(chosen) > 1:
            names = ", ".join(f'"{texts[i]}"' for i in chosen)
            raise ReportParseError(
                f"Columns {names} all look like the {field_name.replace('_', ' ')} column. Rename or remove all but one."
            )
        columns[field_name] = chosen[0]
        if found["strong"]:
            ignored_weak += [texts[i] for i in found["weak"]]
    used = set(columns.values())
    unmapped = [texts[i] for i in range(len(texts)) if i not in used and texts[i].strip()]
    return ColumnMapping(columns=columns, headers=texts, unmapped=unmapped, ignored_weak=ignored_weak)


def is_findings_header(mapping: ColumnMapping) -> bool:
    """A findings table needs a title column plus at least one other recognised column."""
    return "title" in mapping.columns and len(mapping.columns) >= 2


def find_header(rows: list[list[Any]], limit: int = HEADER_SEARCH_ROWS) -> tuple[int, ColumnMapping] | None:
    for index, row in enumerate(rows[:limit]):
        if not any(cell_text(cell) for cell in row):
            continue
        mapping = map_columns(row)
        if is_findings_header(mapping):
            return index, mapping
    return None


def describe_columns(rows: list[list[Any]]) -> str:
    first = next((row for row in rows[:HEADER_SEARCH_ROWS] if any(cell_text(c) for c in row)), [])
    found = [cell_text(c) for c in first if cell_text(c)]
    return ", ".join(f'"{name}"' for name in found[:15]) or "none"


def mapping_warnings(mapping: ColumnMapping, location: str = "") -> list[str]:
    warnings = []
    where = f" in {location}" if location else ""
    if "severity" not in mapping.columns:
        warnings.append(f"No severity column was recognised{where}; findings are imported as Unclassified.")
    if mapping.unmapped:
        names = ", ".join(f'"{n}"' for n in mapping.unmapped)
        warnings.append(f"Columns not mapped to a finding field{where} (values kept in the original record): {names}.")
    if mapping.ignored_weak:
        names = ", ".join(f'"{n}"' for n in mapping.ignored_weak)
        warnings.append(f"Ambiguous columns ignored{where} because a clearer column exists: {names}.")
    return warnings


def rows_to_records(
    rows: list[list[Any]],
    mapping: ColumnMapping,
    first_row_number: int,
    location: dict[str, Any],
    unit: str = "Row",
    none_is_unextracted: bool = False,
) -> list[dict]:
    """Rows below the header -> raw records. A row with values but no title fails the whole file."""
    records = []
    keys = mapping.keys
    title_key = keys[mapping.columns["title"]]
    fields = {field_name: keys[index] for field_name, index in mapping.columns.items()}
    for offset, row in enumerate(rows):
        number = first_row_number + offset
        cells = {key: cell_text(row[i]) if i < len(row) else None for i, key in enumerate(keys)}
        overflow = [text for v in row[len(keys):] if (text := cell_text(v))]
        if overflow:
            cells["(unlabelled columns)"] = "\n".join(overflow)
        if not any(cells.values()):
            continue  # blank row
        if not cells[title_key]:
            raise ReportParseError(f"{unit} {number} has values but no title. No findings were imported.")
        missing = []
        if none_is_unextracted:  # PDF tables: None = the cell could not be read, "" = empty in the report
            missing = [name for name, index in mapping.columns.items() if index >= len(row) or row[index] is None]
        records.append({**location, "row": number, "cells": cells, "_fields": fields, "_missing": missing})
    return records


def _value(record: dict, field_name: str) -> str | None:
    key = record["_fields"].get(field_name)
    return record["cells"].get(key) if key else None


def normalize_tabular_record(record: dict, default_source: str = IMPORTED_SOURCE) -> NormalizedFinding:
    title = _value(record, "title")
    if not title:
        raise ReportParseError(f"Row {record.get('row')} has no title.")
    severity = _value(record, "severity")
    url = _value(record, "affected_url")
    endpoint = _value(record, "endpoint")
    method = _value(record, "http_method")

    cvss_text = _value(record, "cvss_score")
    cvss = None
    if cvss_text:
        match = re.match(r"^\s*(\d{1,2}(?:\.\d+)?)", cvss_text)
        if match and 0 <= float(match.group(1)) <= 10:
            cvss = float(match.group(1))

    cwe_text = _value(record, "cwe")
    cwes = [cwe for token in re.split(r"[,;/\s]+", cwe_text or "") if (cwe := format_cwe(token))]

    reported_status = _value(record, "status")
    mapped_keys = set(record["_fields"].values())
    other = {k: v for k, v in record["cells"].items() if k not in mapped_keys and v}
    metadata: dict[str, Any] = {}
    if reported_status:
        metadata["reported_status"] = reported_status
    if cvss_text and cvss is None:
        metadata["cvss_text"] = cvss_text
    if cwe_text and not cwes:
        metadata["cwe_text"] = cwe_text
    if other:
        metadata["other_columns"] = other
    if record.get("_missing"):
        metadata["not_extracted"] = sorted(set(record["_missing"]))
    for key in ("sheet", "row", "page"):
        if record.get(key) is not None:
            metadata[key] = record[key]

    normalized = normalize_title(title)
    source = _value(record, "source_tool") or default_source
    raw = {k: v for k, v in record.items() if not k.startswith("_")}
    return NormalizedFinding(
        original_title=title,
        normalized_title=normalized,
        original_severity=severity,
        normalized_severity=normalize_severity(severity),
        source_tool=source,
        identity=normalized.lower(),
        raw_record=raw,
        description=_value(record, "description"),
        impact=_value(record, "impact"),
        recommendation=_value(record, "recommendation"),
        affected_url=url,
        endpoint=clean(endpoint) or endpoint_from_url(url),
        parameter=_value(record, "parameter"),
        http_method=method.strip().upper() if method else None,
        evidence=_value(record, "evidence"),
        steps_to_reproduce=_value(record, "steps_to_reproduce"),
        source_reference=_value(record, "source_reference"),
        cwe=", ".join(cwes) or None,
        owasp=_value(record, "owasp"),
        cvss_score=cvss,
        category=_value(record, "category"),
        source_metadata=metadata,
        initial_status=_STATUS_BY_NAME.get((reported_status or "").strip().lower()),
    )
