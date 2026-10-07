"""Generic JSON findings: a list of objects (or {"findings": [...]}-style wrapper) whose keys map to
finding fields. Arbitrary JSON is not treated as a report: a title key plus at least one other
recognised key must be present, and every item must be an object.
"""

from typing import Any

from app.models.enums import ReportType, Scanner
from app.parsers.base import BaseReportParser, ParsedReport, ReportFile, ReportParseError
from app.parsers.tabular import ColumnMapping, is_findings_header, map_columns, mapping_warnings, normalize_tabular_record, rows_to_records

WRAPPER_KEYS = ("findings", "vulnerabilities", "issues", "results", "items")


def _items(data: Any) -> list | None:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        lists = [key for key in WRAPPER_KEYS if isinstance(data.get(key), list)]
        if len(lists) == 1:
            return data[lists[0]]
    return None


def _keys(items: list[dict]) -> list[str]:
    keys: list[str] = []
    for item in items:
        for key in item:
            if key not in keys:
                keys.append(key)
    return keys


def _mapping(file: ReportFile) -> tuple[list[dict], ColumnMapping] | None:
    items = _items(file.try_json())
    if not items or not all(isinstance(item, dict) for item in items):
        return None
    try:
        mapping = map_columns(_keys(items))
    except ReportParseError:
        return None
    return (items, mapping) if is_findings_header(mapping) else None


class GenericJsonParser(BaseReportParser):
    scanner = Scanner.IMPORTED
    report_type = ReportType.JSON
    extensions = (".json",)

    def can_parse(self, file: ReportFile) -> bool:
        return _mapping(file) is not None

    def parse(self, file: ReportFile) -> ParsedReport:
        items, _ = _mapping(file)
        keys = _keys(items)
        mapping = map_columns(keys)  # re-raised errors are explicit (ambiguous keys)
        rows = [[item.get(key) for key in keys] for item in items]
        records = rows_to_records(rows, mapping, 1, {}, unit="Item")
        return ParsedReport(records=records, warnings=mapping_warnings(mapping))

    def normalize(self, record):
        return normalize_tabular_record(record)
