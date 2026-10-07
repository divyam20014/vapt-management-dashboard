"""Phase 5 parsers: ZAP PDF, findings tables in CSV / XLSX / generic JSON / PDF, column mapping."""

import io
import json
import zipfile
from pathlib import Path

import pytest
from openpyxl import Workbook

from app.models.enums import FindingStatus, ReportType, Scanner, Severity
from app.parsers.base import ReportFile, ReportParseError, UnsupportedReportError
from app.parsers.normalization import fingerprint
from app.parsers.pdf import _join_page_breaks
from app.parsers.registry import detect_parser
from tests.fixtures import SAMPLE_REPORTS

ZAP_PDF = SAMPLE_REPORTS / "zap" / "zap-automation.pdf"
ZAP_PDF_JSON = SAMPLE_REPORTS / "zap" / "zap-automation.json"  # same automation run as the PDF
TRACKER_CSV = SAMPLE_REPORTS / "tracker" / "findings-tracker.csv"
TRACKER_XLSX = SAMPLE_REPORTS / "tracker" / "findings-tracker.xlsx"
TRACKER_JSON = SAMPLE_REPORTS / "tracker" / "findings.json"
ZAP_BASELINE_JSON = SAMPLE_REPORTS / "zap" / "zap-baseline.json"


def report(path: Path) -> ReportFile:
    return ReportFile(path.name, path.suffix.lower(), path.read_bytes())


def made(name: str, content: bytes | str) -> ReportFile:
    data = content.encode("utf-8") if isinstance(content, str) else content
    return ReportFile(name, Path(name).suffix.lower(), data)


def parse(file: ReportFile):
    parser = detect_parser(file)
    parsed = parser.parse(file)
    return parser, parsed, [parser.normalize(r) for r in parsed.records]


def key(f):
    return fingerprint(1, f.source_tool, f.identity, f.endpoint, f.parameter, f.identity_method)


def squash(text):
    return "".join((text or "").split())


def xlsx(rows_by_sheet: dict[str, list[list]]) -> bytes:
    wb = Workbook()
    wb.remove(wb.active)
    for name, rows in rows_by_sheet.items():
        sheet = wb.create_sheet(name)
        for row in rows:
            sheet.append(row)
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def tiny_pdf(text: str | None) -> bytes:
    """A minimal valid one-page PDF (optionally with one line of text) for structure tests."""
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode() if text else b""
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % number + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % offset for offset in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(out)


# --- ZAP PDF (real report, checked against the JSON from the same scan) ---------------------

def test_zap_pdf_is_detected_and_matches_the_json_of_the_same_scan():
    parser, parsed, pdf = parse(report(ZAP_PDF))
    assert (parser.scanner, parser.report_type) == (Scanner.ZAP, ReportType.PDF)
    _, _, js = parse(report(ZAP_PDF_JSON))
    assert len(pdf) == len(js) == 18
    by_pdf, by_json = {key(f): f for f in pdf}, {key(f): f for f in js}
    assert set(by_pdf) == set(by_json)  # same finding identities as the JSON report
    for k, f in by_json.items():
        p = by_pdf[k]
        assert (p.original_severity, p.normalized_severity, p.cwe, p.http_method, p.source_template) == (
            f.original_severity, f.normalized_severity, f.cwe, f.http_method, f.source_template)
        # Text is the same; only line breaks differ (PDF layout).
        for field in ("evidence", "description", "recommendation", "source_reference"):
            assert squash(getattr(p, field)) == squash(getattr(f, field)), (field, f.normalized_title)
    assert parsed.scan_date.isoformat().startswith("2026-10-07T13:50:21")
    assert any("line breaks" in w for w in parsed.warnings)


def test_zap_pdf_marks_fields_the_pdf_does_not_show_as_not_extracted():
    _, _, pdf = parse(report(ZAP_PDF))
    assert all(f.source_metadata["not_extracted"] == ["parameter"] for f in pdf)
    assert all(f.parameter is None for f in pdf)


def test_zap_pdf_with_a_missing_page_is_rejected(monkeypatch):
    file = report(ZAP_PDF)
    from app.parsers import pdf as pdf_module

    document = pdf_module._document(file)
    file.__dict__["_pdf"] = {"pages": document["pages"][:-2]}  # simulate a report cut short
    with pytest.raises(ReportParseError, match="appears incomplete"):
        detect_parser(file).parse(file)


def test_page_break_rows_are_rejoined():
    pages = [
        [["Method", "GET"], ["Other", None]],
        [["Info", "text after a page break"], ["Plugin Id", "1"], [None, "<script> first half"]],
        [["Evidence", "second half"], ["", "wrapped continuation"]],
    ]
    rows = _join_page_breaks(pages)
    assert rows == [
        ["Method", "GET"],
        ["Other Info", "text after a page break"],
        ["Plugin Id", "1"],
        ["Evidence", "<script> first half\nsecond half\nwrapped continuation"],
    ]


# --- PDF without a recognisable table -------------------------------------------------------

def test_pdf_without_findings_table_imports_nothing():
    with pytest.raises(ReportParseError, match="No findings table was recognised"):
        parse(made("newsletter.pdf", tiny_pdf("Quarterly newsletter")))


def test_scanned_pdf_without_text_is_explained():
    with pytest.raises(ReportParseError, match="no extractable text"):
        parse(made("scan.pdf", tiny_pdf(None)))


def test_damaged_pdf_is_a_parse_error():
    with pytest.raises(ReportParseError, match="could not be read|not a readable PDF"):
        parse(made("broken.pdf", b"%PDF-1.7\n1 0 obj << /Type /Catalog"))


# --- Tracker fixtures (values copied verbatim from the real ZAP and Nuclei reports) ----------

@pytest.mark.parametrize(
    "path, report_type",
    [(TRACKER_CSV, ReportType.CSV), (TRACKER_XLSX, ReportType.XLSX), (TRACKER_JSON, ReportType.JSON)],
)
def test_tracker_formats_are_detected_and_imported(path, report_type):
    parser, parsed, findings = parse(report(path))
    assert (parser.scanner, parser.report_type) == (Scanner.IMPORTED, report_type)
    assert len(findings) == 54
    severities = {s: sum(f.normalized_severity == s for f in findings) for s in (Severity.MEDIUM, Severity.LOW, Severity.INFORMATIONAL)}
    assert severities == {Severity.MEDIUM: 10, Severity.LOW: 21, Severity.INFORMATIONAL: 23}
    assert len({key(f) for f in findings}) == 48


def test_tracker_formats_produce_identical_findings():
    views = []
    for path in (TRACKER_CSV, TRACKER_XLSX, TRACKER_JSON):
        _, _, findings = parse(report(path))
        views.append(sorted((key(f), f.evidence or "", f.description or "", f.cwe or "", f.source_tool) for f in findings))
    assert views[0] == views[1] == views[2]


def test_tracker_values_are_verbatim_from_the_scanner_report():
    zap = json.loads(ZAP_BASELINE_JSON.read_text(encoding="utf-8"))
    raw_evidence = {i["evidence"] for a in zap["site"][0]["alerts"] for i in a["instances"] if i["evidence"]}
    _, _, findings = parse(report(TRACKER_XLSX))
    zap_rows = [f for f in findings if f.source_tool == "OWASP ZAP"]
    assert {f.evidence for f in zap_rows if f.evidence} == raw_evidence
    csp = next(f for f in zap_rows if f.original_title == "Content Security Policy (CSP) Header Not Set")
    assert (csp.original_severity, csp.cwe, csp.affected_url, csp.endpoint) == ("Medium", "CWE-693", "http://juice:3000", "http://juice:3000/")
    assert csp.initial_status is None and "reported_status" not in csp.source_metadata  # Status column is empty
    assert csp.source_metadata["sheet"] == "Findings" and csp.source_metadata["row"] == 4
    assert csp.source_metadata["other_columns"] == {"Sr. No.": "1"}


def test_xlsx_reports_which_sheet_was_used_and_skips_title_rows():
    _, parsed, _ = parse(report(TRACKER_XLSX))
    assert any('sheet "Findings"' in w for w in parsed.warnings)


# --- Column mapping ------------------------------------------------------------------------

def test_header_synonyms_case_and_punctuation():
    csv_text = "VULNERABILITY NAME,Risk-Level,affected_url,Proof Of Concept,Remediation,CWE ID,cvss_score\n" \
               "SQL injection,HIGH,https://app.example/search?q=1,payload ' OR 1=1,Use bound parameters,79; CWE-89,7.5 (High)\n"
    _, parsed, [f] = parse(made("t.csv", csv_text))
    assert (f.original_title, f.original_severity, f.normalized_severity) == ("SQL injection", "HIGH", Severity.HIGH)
    assert f.endpoint == "https://app.example/search"
    assert f.evidence == "payload ' OR 1=1"
    assert f.cwe == "CWE-79, CWE-89" and f.cvss_score == 7.5
    assert parsed.warnings == []


def test_weak_synonym_yields_to_a_strong_one():
    _, parsed, [f] = parse(made("t.csv", "Name,Vulnerability,Severity\nAsset 12,Open redirect,Low\n"))
    assert f.original_title == "Open redirect"
    assert f.source_metadata["other_columns"] == {"Name": "Asset 12"}
    assert any('Ambiguous columns ignored' in w and '"Name"' in w for w in parsed.warnings)


def test_two_equally_strong_title_columns_are_an_error():
    with pytest.raises(ReportParseError, match='"Title", "Finding".*title column'):
        parse(made("t.csv", "Title,Finding,Severity\nA,B,Low\n"))


def test_missing_title_column_lists_the_columns_found():
    with pytest.raises(ReportParseError, match='Columns found: "Host", "Port", "Notes"'):
        parse(made("t.csv", "Host,Port,Notes\nexample.com,443,ok\n"))


def test_row_without_title_imports_nothing():
    with pytest.raises(ReportParseError, match="Row 3 has values but no title"):
        parse(made("t.csv", "Title,Severity\nA,Low\n,High\n"))


def test_blank_rows_are_skipped_and_missing_severity_is_unclassified():
    _, parsed, findings = parse(made("t.csv", "Title,Description\nA,first\n,\nB,second\n"))
    assert [f.original_title for f in findings] == ["A", "B"]
    assert all(f.normalized_severity is None and f.original_severity is None for f in findings)
    assert any("No severity column" in w for w in parsed.warnings)


def test_reported_status_is_kept_and_mapped_only_when_exact():
    _, _, findings = parse(made("t.csv", "Title,Severity,Status\nA,Low,In Progress\nB,Low,Fixed\nC,Low,\n"))
    a, b, c = findings
    assert (a.initial_status, a.source_metadata["reported_status"]) == (FindingStatus.IN_PROGRESS, "In Progress")
    assert (b.initial_status, b.source_metadata["reported_status"]) == (None, "Fixed")  # not one of the 7 statuses
    assert c.initial_status is None and "reported_status" not in c.source_metadata


def test_unparseable_scores_are_kept_as_text_not_guessed():
    _, _, [f] = parse(made("t.csv", "Title,CVSS,CWE\nA,N/A,unknown\n"))
    assert f.cvss_score is None and f.source_metadata["cvss_text"] == "N/A"
    assert f.cwe is None and f.source_metadata["cwe_text"] == "unknown"


def test_formula_like_values_are_data_not_formulas():
    _, _, [f] = parse(made("t.csv", 'Title,Evidence\n"=HYPERLINK(""http://x"")",=1+1\n'))
    assert f.original_title == '=HYPERLINK("http://x")' and f.evidence == "=1+1"


# --- CSV dialects and encodings -------------------------------------------------------------

def test_semicolon_csv_from_european_excel():
    _, parsed, [f] = parse(made("t.csv", "Title;Severity;Description\nWeak TLS;Medium;Uses TLS 1.0, 1.1\n"))
    assert (f.original_title, f.description) == ("Weak TLS", "Uses TLS 1.0, 1.1")
    assert any("separated by ';'" in w for w in parsed.warnings)


def test_windows_1252_csv_is_decoded_with_a_warning():
    _, parsed, [f] = parse(made("t.csv", "Title,Severity\nCaf\xe9 login bypass,High\n".encode("cp1252")))
    assert f.original_title == "Café login bypass"
    assert any("Windows-1252" in w for w in parsed.warnings)


# --- XLSX safety and ambiguity -------------------------------------------------------------

def test_workbook_with_two_equally_good_sheets_is_ambiguous():
    rows = [["Title", "Severity"], ["A", "Low"]]
    with pytest.raises(ReportParseError, match="Several sheets look like findings tables"):
        parse(made("t.xlsx", xlsx({"One": rows, "Two": rows})))


def test_xlsx_without_findings_table():
    with pytest.raises(ReportParseError, match="No findings table was recognised in this workbook"):
        parse(made("t.xlsx", xlsx({"Notes": [["Meeting"], ["Agenda"]]})))


def _zip(entries: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in entries.items():
            archive.writestr(name, data)
    return buffer.getvalue()


@pytest.mark.parametrize(
    "entries, message",
    [
        ({"word/document.xml": b"<w/>"}, "not an Excel XLSX workbook"),
        ({"xl/workbook.xml": b"<x/>", "xl/vbaProject.bin": b"macro"}, "macros"),
        ({"xl/workbook.xml": b"<x/>", "xl/bomb.xml": b"\0" * (50 * 1024 * 1024)}, "unsafe size"),
    ],
)
def test_unsafe_or_foreign_zip_packages_are_rejected(entries, message):
    with pytest.raises(ReportParseError, match=message):
        parse(made("t.xlsx", _zip(entries)))


def test_damaged_xlsx():
    with pytest.raises(ReportParseError, match="not a valid XLSX"):
        parse(made("t.xlsx", b"PK\x03\x04 truncated"))


# --- Generic JSON ----------------------------------------------------------------------------

def test_arbitrary_json_is_not_treated_as_a_report():
    for content in ('{"items": [{"foo": 1}]}', '[{"title": "only a title"}]', '{"findings": "none"}', '[1, 2, 3]'):
        with pytest.raises(UnsupportedReportError):
            parse(made("x.json", content))


def test_generic_json_with_nested_values():
    data = {"issues": [{"name": "Weak cipher", "risk": "Low", "references": ["https://a.example", "https://b.example"]}]}
    _, _, [f] = parse(made("x.json", json.dumps(data)))
    assert f.original_title == "Weak cipher" and f.normalized_severity == Severity.LOW
    assert f.source_reference == "https://a.example\nhttps://b.example"


def test_generic_json_item_without_title():
    with pytest.raises(ReportParseError, match="Item 2 has values but no title"):
        parse(made("x.json", json.dumps([{"title": "A", "severity": "Low"}, {"severity": "High"}])))


# --- Generic PDF table (the application's own project report, printed to PDF from real data) ---

REPORT_PDF = SAMPLE_REPORTS / "generic" / "project-report.pdf"


def test_findings_table_in_a_pdf_is_imported_completely():
    parser, parsed, findings = parse(report(REPORT_PDF))
    assert (parser.scanner, parser.report_type) == (Scanner.IMPORTED, ReportType.PDF)
    assert len(findings) == 48
    assert [int(f.source_metadata["other_columns"]["#"]) for f in findings] == list(range(1, 49))
    assert {f.source_tool for f in findings} == {"OWASP ZAP", "Nuclei"}
    # Wrapped cells are rejoined: URLs without whitespace, titles without layout breaks.
    assert all(" " not in (f.endpoint or "") and "\n" not in f.original_title for f in findings)
    assert "Cross-Origin-Embedder-Policy Header Missing or Invalid" in {f.original_title for f in findings}
    # The row cut by the page break is merged back, so every date is complete.
    assert {f.source_metadata["other_columns"]["Last\nDetected"].replace("\n", " ") for f in findings} == {
        "07 Oct 2026 10:06 UTC", "07 Oct 2026 10:05 UTC"}
    assert any("other tables were ignored" in w for w in parsed.warnings)  # per-severity summary tables


def test_pdf_table_with_a_lost_row_is_refused():
    file = report(REPORT_PDF)
    from app.parsers import pdf as pdf_module

    pages = pdf_module._document(file)["pages"]
    for page in pages:
        for table in page["tables"]:
            if len(table) > 5 and table[0][0] == "#":
                del table[3]  # simulate extraction losing a row in the middle of a page
                break
        else:
            continue
        break
    with pytest.raises(ReportParseError, match=r'column "#" is missing: \d+'):
        detect_parser(file).parse(file)
