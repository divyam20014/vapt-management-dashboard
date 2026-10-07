"""PDF reports (pdfplumber). Only structure that can be recognised confidently is imported:

- ZAP "traditional-pdf" reports: alert detail tables, checked against the report's own
  "Summary of Alerts" counts.
- Any PDF containing a findings table whose header row maps to known columns.

Text that cannot be tied to a field is not guessed. Fields a report layout should contain but that
could not be read are listed as "not_extracted" on the finding.
"""

import io
import re
from typing import Any

from app.models.enums import ReportType, Scanner
from app.parsers.base import BaseReportParser, NormalizedFinding, ParsedReport, ReportFile, ReportParseError
from app.parsers.tabular import (
    ColumnMapping,
    _norm_header,
    describe_columns,
    is_findings_header,
    map_columns,
    mapping_warnings,
    normalize_tabular_record,
    rows_to_records,
)
from app.parsers.zap import (
    _HTML_ALERT_FIELDS,
    _HTML_INSTANCE_FIELDS,
    _SUMMARY_RISK_LEVELS,
    _parse_zap_date,
    _records_from_alerts,
    normalize_zap_record,
    verify_alert_counts,
)

MAX_PAGES = 500
LAYOUT_WARNING = (
    "Values were extracted from PDF text: line breaks inside descriptions and evidence may come from the "
    "page layout rather than the original data."
)
# PDF instance labels -> finding field reported as "not extracted" when the label is missing.
_INSTANCE_FIELD_NAMES = {"Method": "http_method", "Parameter": "parameter", "Evidence": "evidence", "Attack": "attack", "Other Info": "other_info"}
_ALERT_FIELD_NAMES = {"Description": "description", "Solution": "recommendation", "Reference": "source_reference", "CWE Id": "cwe", "Plugin Id": "source_template"}


def _label(value: Any) -> str:
    return " ".join(str(value or "").split())


def _unwrap(value: str) -> str:
    """Undo line wrapping in values that cannot contain line breaks (titles, URLs)."""
    return re.sub(r"\s+", " ", re.sub(r"-\n(?=\S)", "-", value)).strip()


def _unwrap_url(value: str) -> str:
    return re.sub(r"\s+", "", value)


_KNOWN_LABELS = set(_HTML_ALERT_FIELDS) | set(_HTML_INSTANCE_FIELDS) | {"URL"}


def _text(value: Any) -> str:
    return "" if value is None else str(value)


def _join_page_breaks(pages: list[list[list[Any]]]) -> list[list[Any]]:
    """Rejoin label/value rows that a page break split, so no text is silently dropped.

    Seen in real ZAP PDFs: a label split over two pages ("Other" | "Info"), and a long value whose
    first part ends one page with an empty label while its label is printed on the next page.
    """
    rows: list[list[Any]] = []
    for page in pages:
        page = [row for row in page if _label(row[0]) or _text(row[1]).strip()]  # drop blank padding rows first
        if rows and page:
            prev, first = rows[-1], page[0]
            prev_label, first_label = _label(prev[0]), _label(first[0])
            prev_value, first_value = _text(prev[1]).strip(), _text(first[1]).strip()
            if prev_label and not prev_value and f"{prev_label} {first_label}" in _KNOWN_LABELS:
                rows[-1] = [f"{prev_label} {first_label}", first[1]]  # label split across pages
                page = page[1:]
            elif not prev_label and prev_value and first_label:
                rows[-1] = [first[0], f"{_text(prev[1])}\n{_text(first[1])}"]  # value began before its label
                page = page[1:]
            elif prev_label and not first_label and first_value:
                rows[-1] = [prev[0], f"{_text(prev[1])}\n{_text(first[1])}"]  # value continues on this page
                page = page[1:]
        rows.extend(page)
    joined: list[list[Any]] = []
    for row in rows:
        if not _label(row[0]) and not _text(row[1]).strip():
            continue  # blank padding row
        if not _label(row[0]) and joined:
            joined[-1] = [joined[-1][0], f"{_text(joined[-1][1])}\n{_text(row[1])}"]  # wrapped continuation
            continue
        joined.append(row)
    return joined


def _tables(page) -> list[list[list[Any]]]:
    """Tables of one page. A table cut by the page break has no closing border, and its last
    (partial) row would be dropped; an explicit line under the lowest text closes it. The line only
    forms cells where a table's vertical borders reach it, so complete tables are unaffected."""
    words = page.extract_words()
    if not words:
        return page.extract_tables()
    bottom = min(max(word["bottom"] for word in words) + 1, page.bbox[3])
    return page.extract_tables({"explicit_horizontal_lines": [bottom]})


def _document(file: ReportFile) -> dict[str, Any]:
    """Text and tables of every page, read once per upload."""
    cached = file.__dict__.get("_pdf")
    if cached is not None:
        return cached
    import pdfplumber
    from pdfminer.pdfdocument import PDFEncryptionError, PDFPasswordIncorrect
    from pdfminer.pdfparser import PDFSyntaxError

    try:
        with pdfplumber.open(io.BytesIO(file.content)) as pdf:
            if len(pdf.pages) > MAX_PAGES:
                raise ReportParseError(f"The PDF has more than {MAX_PAGES} pages and was not processed.")
            pages = [{"number": i + 1, "text": page.extract_text() or "", "tables": _tables(page)} for i, page in enumerate(pdf.pages)]
    except (PDFPasswordIncorrect, PDFEncryptionError) as exc:
        raise ReportParseError("The PDF is password-protected or encrypted and cannot be read.") from exc
    except PDFSyntaxError as exc:
        raise ReportParseError("The file is not a readable PDF document.") from exc
    except ReportParseError:
        raise
    except Exception as exc:  # pdfminer raises many types for damaged files
        raise ReportParseError("The PDF could not be read; it may be damaged.") from exc
    document = {"pages": pages}
    file.__dict__["_pdf"] = document
    return document


class ZapPdfParser(BaseReportParser):
    scanner = Scanner.ZAP
    report_type = ReportType.PDF
    extensions = (".pdf",)

    def can_parse(self, file: ReportFile) -> bool:
        try:
            pages = _document(file)["pages"]
        except ReportParseError:
            return False
        head = " ".join(page["text"] for page in pages[:2])
        return "ZAP" in head and "Scanning" in head and "Summary of Alerts" in head

    def parse(self, file: ReportFile) -> ParsedReport:
        pages = _document(file)["pages"]
        first_text = pages[0]["text"]
        site_match = re.search(r"^Site:\s*(\S+)", first_text, re.M)
        generated_match = re.search(r"Generated on\s+(.+)", first_text)

        declared: dict[str, int] | None = None
        page_rows: list[list[list[Any]]] = []
        for page in pages:
            current: list[list[Any]] = []
            for table in page["tables"]:
                header = [_label(c) for c in table[0]] if table else []
                if header[:2] == ["Risk Level", "Number of Alerts"] and declared is None:
                    declared = {
                        _label(r[0]): int(_label(r[1])) for r in table[1:]
                        if len(r) >= 2 and _label(r[0]) in _SUMMARY_RISK_LEVELS and _label(r[1]).isdigit()
                    }
                    continue
                current.extend(list(row) for row in table if len(row) == 2)
            page_rows.append(current)
        rows = _join_page_breaks(page_rows)

        alerts: list[dict[str, Any]] = []
        alert: dict[str, Any] | None = None
        instance: dict[str, Any] | None = None
        for index, (left, right) in enumerate(rows):
            label = _label(left)
            next_label = _label(rows[index + 1][0]) if index + 1 < len(rows) else ""
            if label in _SUMMARY_RISK_LEVELS and right and next_label == "Description":
                alert = {"risk": label, "alert": _unwrap(right), "instances": [], "_labels": set()}
                alerts.append(alert)
                instance = None
                continue
            if alert is None:
                continue
            value = right if right is not None else None
            if label == "URL":
                instance = {"uri": _unwrap_url(value or ""), "_labels": set()}
                alert["instances"].append(instance)
            elif instance is not None and label in _HTML_INSTANCE_FIELDS:
                key = _HTML_INSTANCE_FIELDS[label]
                instance[key] = _unwrap_url(value) if key == "nodeName" and value else value
                instance["_labels"].add(label)
            elif label in _HTML_ALERT_FIELDS:
                instance = None
                alert[_HTML_ALERT_FIELDS[label]] = value
                alert["_labels"].add(label)

        verify_alert_counts(declared, alerts, "PDF")

        for alert in alerts:
            alert_labels = alert.pop("_labels")
            alert_missing = [name for label, name in _ALERT_FIELD_NAMES.items() if label not in alert_labels]
            for inst in alert["instances"]:
                labels = inst.pop("_labels")
                inst_missing = [name for label, name in _INSTANCE_FIELD_NAMES.items() if label not in labels]
                inst["not_extracted"] = sorted(set(alert_missing + inst_missing))
        warnings = [LAYOUT_WARNING]
        scan_date = _parse_zap_date(None, generated_match.group(1) if generated_match else None, warnings)
        site = site_match.group(1) if site_match else None
        return ParsedReport(records=_records_from_alerts(site, alerts), scan_date=scan_date, warnings=warnings)

    def normalize(self, record) -> NormalizedFinding:
        finding = normalize_zap_record(record, fields_are_html=False)
        missing = (record.get("instance") or {}).get("not_extracted") or []
        if missing:
            finding.source_metadata["not_extracted"] = missing
        return finding


# Short fields where a line break can only come from cell wrapping; URLs cannot contain whitespace at all.
_WRAPPED_FIELDS = {"title", "severity", "status", "http_method", "cwe", "owasp", "cvss_score", "category", "source_tool", "parameter"}
_URL_FIELDS = {"affected_url", "endpoint"}


def _merge_split_rows(parts: list[tuple[int, list[list[Any]], int]], mapping: ColumnMapping) -> list[tuple[int, list[Any]]]:
    """A row cut by a page break continues as the first row on the next page with an empty title: merge it back."""
    title = mapping.columns["title"]
    rows: list[tuple[int, list[Any]]] = []
    for part_index, (page_number, body, _) in enumerate(parts):
        body = [row for row in body if any(_text(cell).strip() for cell in row)]  # blank rows never carry data
        for row_index, row in enumerate(body):
            continues = part_index > 0 and row_index == 0 and rows and not _text(row[title] if title < len(row) else None).strip()
            if continues and any(_text(cell).strip() for cell in row):
                previous_page, previous = rows[-1]
                merged = []
                for i in range(max(len(previous), len(row))):
                    a = previous[i] if i < len(previous) else None
                    b = row[i] if i < len(row) else None
                    parts_text = [t for t in (_text(a), _text(b)) if t.strip()]
                    merged.append("\n".join(parts_text) if parts_text else (None if a is None and b is None else ""))
                rows[-1] = (previous_page, merged)
            else:
                rows.append((page_number, list(row)))
    return rows


_ROW_NUMBER_HEADERS = {"", "no", "sr no", "s no", "sl no", "serial", "serial no", "row", "item"}


def _check_row_numbers(records: list[dict], mapping: ColumnMapping) -> None:
    """PDF table extraction can drop a row at a page break. When the table numbers its rows (#, No.,
    Sr. No.), a gap in the sequence proves a row was lost: refuse rather than import an incomplete set."""
    for index, header in enumerate(mapping.headers):
        if index in mapping.columns.values() or _norm_header(header) not in _ROW_NUMBER_HEADERS or not header.strip():
            continue
        key = mapping.keys[index]
        values = [(record["cells"].get(key) or "").strip() for record in records]
        if not values or not all(value.isdigit() for value in values):
            continue
        numbers = [int(value) for value in values]
        expected = list(range(numbers[0], numbers[0] + len(numbers)))
        if numbers != expected:
            missing = sorted(set(range(min(numbers), max(numbers) + 1)) - set(numbers))
            listed = ", ".join(str(n) for n in missing[:10]) or "out of order"
            raise ReportParseError(
                f'Rows of the PDF findings table could not all be read (column "{header.strip()}" is missing: {listed}). '
                "No findings were imported; upload the original spreadsheet or another format if available."
            )


def _unwrap_cells(row: list[Any], mapping: ColumnMapping) -> list[Any]:
    cleaned = list(row)
    for field_name, index in mapping.columns.items():
        if index >= len(cleaned) or cleaned[index] is None:
            continue
        if field_name in _URL_FIELDS:
            cleaned[index] = _unwrap_url(cleaned[index])
        elif field_name in _WRAPPED_FIELDS:
            cleaned[index] = _unwrap(cleaned[index])
    return cleaned


class PdfTableParser(BaseReportParser):
    """Findings tables inside any PDF (one row per finding, headers mapped like CSV/XLSX)."""

    scanner = Scanner.IMPORTED
    report_type = ReportType.PDF
    extensions = (".pdf",)

    def can_parse(self, file: ReportFile) -> bool:
        return True  # fallback for PDFs; parse() explains when nothing is recognisable

    def parse(self, file: ReportFile) -> ParsedReport:
        pages = _document(file)["pages"]
        # Findings tables grouped by header; a headerless table at the top of a page with the same
        # width continues the group above it (tables that span a page break).
        groups: dict[tuple, dict[str, Any]] = {}
        current: tuple | None = None
        first_seen_rows: list[list[Any]] = []
        for page in pages:
            for table in page["tables"]:
                if not table:
                    continue
                first_seen_rows = first_seen_rows or table
                header_index, mapping = None, None
                for i, row in enumerate(table[:3]):
                    try:
                        candidate = map_columns(row)
                    except ReportParseError:
                        continue
                    if is_findings_header(candidate):
                        header_index, mapping = i, candidate
                        break
                if mapping is not None:
                    current = tuple(_norm_header(h) for h in mapping.headers)  # wrapping-insensitive
                    group = groups.setdefault(current, {"mapping": mapping, "width": len(table[header_index]), "parts": []})
                    group["parts"].append((page["number"], table[header_index + 1:], header_index + 2))
                elif current is not None and len(table[0]) == groups[current]["width"]:
                    groups[current]["parts"].append((page["number"], table, 1))
                else:
                    current = None

        if not groups:
            text_chars = sum(len(page["text"].strip()) for page in pages)
            if not text_chars:
                raise ReportParseError(
                    "The PDF contains no extractable text (it may be a scanned image). Text recognition (OCR) is not "
                    "supported, so no findings were imported."
                )
            raise ReportParseError(
                f"No findings table was recognised in this PDF ({len(pages)} page(s) of text were read). A table needs a "
                f"title column (e.g. \"Title\", \"Finding\", \"Vulnerability\") plus another known column. "
                f"First table columns: {describe_columns(first_seen_rows)}. No findings were imported."
            )

        # Several findings tables (e.g. a full register plus per-severity summaries) would import the same
        # findings twice; use the most complete one, as for multi-sheet workbooks.
        ranked = sorted(groups.values(), key=lambda g: len(g["mapping"].columns), reverse=True)
        if len(ranked) > 1 and len(ranked[0]["mapping"].columns) == len(ranked[1]["mapping"].columns):
            raise ReportParseError(
                "The PDF contains several different findings tables and none is clearly the main one, so no findings "
                "were imported. Upload a document with a single findings table."
            )
        chosen = ranked[0]
        mapping = chosen["mapping"]
        records: list[dict] = []
        for number, (page_number, row) in enumerate(_merge_split_rows(chosen["parts"], mapping), start=1):
            records.extend(rows_to_records([_unwrap_cells(row, mapping)], mapping, number, {"page": page_number}, none_is_unextracted=True))
        _check_row_numbers(records, mapping)
        warnings = mapping_warnings(mapping)
        if len(ranked) > 1:
            ignored = "; ".join(", ".join(h for h in g["mapping"].headers if h) for g in ranked[1:])
            warnings.append(f"Findings were read from the most complete table; other tables were ignored (columns: {ignored}).")
        warnings.append(LAYOUT_WARNING)
        return ParsedReport(records=records, warnings=warnings)

    def normalize(self, record):
        return normalize_tabular_record(record)
