"""Nuclei results: JSON export (array), JSONL, and plain-text output.

Structures verified against Nuclei v3 output (see sample-reports/nuclei/).
"""

import json
import re
from typing import Any

from app.models.enums import ReportType, Scanner
from app.parsers.base import BaseReportParser, NormalizedFinding, ParsedReport, ReportFile, ReportParseError
from app.parsers.normalization import (
    clean,
    endpoint_from_url,
    format_cwe,
    normalize_severity,
    normalize_title,
    parse_iso_datetime,
)

SOURCE_TOOL = Scanner.NUCLEI.value

_ANSI = re.compile(r"\x1b\[[0-9;]*m")
# [template-id(:matcher)] [type] [severity] target [extra...]
_TXT_LINE = re.compile(r"^\[(?P<template>[^\]\s]+)\] \[(?P<type>[^\]\s]+)\] \[(?P<severity>[^\]\s]+)\] (?P<target>\S+)(?: (?P<extra>.+))?$")
_REQUEST_METHOD = re.compile(r"^([A-Z]+) \S+ HTTP/\d")


def _is_result(item: Any) -> bool:
    return isinstance(item, dict) and isinstance(item.get("template-id"), str)


def _as_list(value) -> list:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _scan_date(records: list[dict[str, Any]]):
    dates = [parsed for record in records if (parsed := parse_iso_datetime(record.get("timestamp")))]
    return min(dates) if dates else None


def _text_list(value) -> str | None:
    items = [str(item) for item in _as_list(value) if clean(item)]
    return "\n".join(items) or None


def _strip(value) -> str | None:
    text = clean(value)
    return text.strip() if text else None


def normalize_nuclei_record(record: dict[str, Any]) -> NormalizedFinding:
    info = record.get("info") if isinstance(record.get("info"), dict) else {}
    classification = info.get("classification") if isinstance(info.get("classification"), dict) else {}
    template_id = record["template-id"]
    matcher = clean(record.get("matcher-name"))

    name = _strip(info.get("name"))
    original_title = name or template_id
    # The matcher name distinguishes results of multi-matcher templates (e.g. which header is missing).
    normalized = normalize_title(f"{original_title}: {matcher}" if matcher else original_title)

    target = clean(record.get("matched-at")) or clean(record.get("url")) or clean(record.get("host"))
    method = None
    if request := clean(record.get("request")):
        if match := _REQUEST_METHOD.match(request):
            method = match.group(1)

    cwes = [cwe for value in _as_list(classification.get("cwe-id")) if (cwe := format_cwe(value))]
    cvss = classification.get("cvss-score")
    try:
        cvss_score = float(cvss) if cvss not in (None, "") else None
    except (TypeError, ValueError):
        cvss_score = None

    metadata = {
        "template_id": template_id,
        "matcher_name": matcher,
        "type": clean(record.get("type")),
        "tags": _as_list(info.get("tags")) or None,
        "cve_id": _text_list(classification.get("cve-id")),
        "cvss_metrics": clean(classification.get("cvss-metrics")),
        "extra": clean(record.get("txt-extra")),
    }

    return NormalizedFinding(
        original_title=original_title,
        normalized_title=normalized,
        original_severity=clean(info.get("severity")),
        normalized_severity=normalize_severity(info.get("severity")),
        source_tool=SOURCE_TOOL,
        identity=f"{template_id}:{matcher}" if matcher else template_id,
        raw_record=record,
        source_template=template_id,
        description=_strip(info.get("description")),
        impact=_strip(info.get("impact")),
        recommendation=_strip(info.get("remediation")),
        source_reference=_text_list(info.get("reference")),
        affected_url=target,
        endpoint=endpoint_from_url(target),
        parameter=clean(record.get("fuzzing_parameter")),
        http_method=method,
        method_in_identity=False,  # only inferred from the raw request; absent in text output
        evidence=_text_list(record.get("extracted-results")),
        # Nuclei's own reproduction command for the matched request.
        steps_to_reproduce=clean(record.get("curl-command")),
        cwe=", ".join(cwes) or None,
        cvss_score=cvss_score,
        source_metadata={key: value for key, value in metadata.items() if value is not None},
    )


class NucleiJsonParser(BaseReportParser):
    """`nuclei -je file.json`: a JSON array of results."""

    scanner = Scanner.NUCLEI
    report_type = ReportType.JSON
    extensions = (".json",)

    def can_parse(self, file: ReportFile) -> bool:
        data = file.try_json()
        return isinstance(data, list) and bool(data) and _is_result(data[0])

    def parse(self, file: ReportFile) -> ParsedReport:
        data = file.json
        for index, item in enumerate(data, start=1):
            if not _is_result(item):
                raise ReportParseError(f"Item {index} in the Nuclei JSON array is not a Nuclei result.")
        return ParsedReport(records=data, scan_date=_scan_date(data))

    def normalize(self, record):
        return normalize_nuclei_record(record)


class NucleiJsonlParser(BaseReportParser):
    """`nuclei -jsonl` / `-jle`: one JSON result per line (also accepted with a .json extension)."""

    scanner = Scanner.NUCLEI
    report_type = ReportType.JSONL
    extensions = (".jsonl", ".json")

    def can_parse(self, file: ReportFile) -> bool:
        if file.extension == ".json" and file.try_json() is not None:
            return False  # a single JSON document is not JSONL
        first = next((line for line in file.text.splitlines() if line.strip()), "")
        try:
            return _is_result(json.loads(first))
        except ValueError:
            return False

    def parse(self, file: ReportFile) -> ParsedReport:
        records = []
        for number, line in enumerate(file.text.splitlines(), start=1):
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except ValueError as exc:
                raise ReportParseError(f"Line {number} is not valid JSON ({exc.msg}). No findings were imported.") from exc
            if not _is_result(item):
                raise ReportParseError(f"Line {number} is not a Nuclei result. No findings were imported.")
            records.append(item)
        return ParsedReport(records=records, scan_date=_scan_date(records))

    def normalize(self, record):
        return normalize_nuclei_record(record)


class NucleiTxtParser(BaseReportParser):
    """Default Nuclei text output (`-o file.txt`). Only template, type, severity and target exist."""

    scanner = Scanner.NUCLEI
    report_type = ReportType.TXT
    extensions = (".txt",)

    def can_parse(self, file: ReportFile) -> bool:
        first = next((line for line in file.text.splitlines() if line.strip()), "")
        return bool(_TXT_LINE.match(_ANSI.sub("", first).strip()))

    def parse(self, file: ReportFile) -> ParsedReport:
        records = []
        for number, raw_line in enumerate(file.text.splitlines(), start=1):
            line = _ANSI.sub("", raw_line).strip()
            if not line:
                continue
            match = _TXT_LINE.match(line)
            if not match:
                raise ReportParseError(f"Line {number} is not a Nuclei result line. No findings were imported.")
            template, _, matcher = match.group("template").partition(":")
            record: dict[str, Any] = {
                "line": line,
                "template-id": template,
                "type": match.group("type"),
                "info": {"severity": match.group("severity")},
                "matched-at": match.group("target"),
            }
            if matcher:
                record["matcher-name"] = matcher
            if extra := match.group("extra"):
                record["txt-extra"] = extra
            records.append(record)
        warnings = ["Nuclei text output contains no descriptions, references, CWE or timestamps; those fields were not provided."]
        return ParsedReport(records=records, scan_date=None, warnings=warnings)

    def normalize(self, record):
        return normalize_nuclei_record(record)
