import json
from pathlib import Path

import pytest

from app.models.enums import ReportType, Scanner, Severity
from app.parsers.base import NormalizedFinding, ReportFile, ReportParseError, UnsupportedReportError
from app.parsers.normalization import endpoint_from_url, fingerprint, format_cwe, normalize_severity
from app.parsers.registry import detect_parser
from tests.fixtures import (
    NUCLEI_JSON,
    NUCLEI_JSONL,
    NUCLEI_RESULTS,
    NUCLEI_TXT,
    ZAP_HTML,
    ZAP_INSTANCES,
    ZAP_JSON,
    ZAP_XML,
)


def report(path: Path) -> ReportFile:
    return ReportFile(filename=path.name, extension=path.suffix.lower(), content=path.read_bytes())


def text_report(name: str, content: str | bytes) -> ReportFile:
    data = content.encode("utf-8") if isinstance(content, str) else content
    return ReportFile(filename=name, extension=Path(name).suffix.lower(), content=data)


def normalize_all(file: ReportFile) -> list[NormalizedFinding]:
    parser = detect_parser(file)
    return [parser.normalize(record) for record in parser.parse(file).records]


def keys(findings: list[NormalizedFinding]) -> set[str]:
    return {fingerprint(1, f.source_tool, f.identity, f.endpoint, f.parameter, f.identity_method) for f in findings}


# --- detection -------------------------------------------------------------------------------

@pytest.mark.parametrize(
    "path, scanner, report_type, count",
    [
        (ZAP_JSON, Scanner.ZAP, ReportType.JSON, ZAP_INSTANCES),
        (ZAP_XML, Scanner.ZAP, ReportType.XML, ZAP_INSTANCES),
        (ZAP_HTML, Scanner.ZAP, ReportType.HTML, ZAP_INSTANCES),
        (NUCLEI_JSON, Scanner.NUCLEI, ReportType.JSON, NUCLEI_RESULTS),
        (NUCLEI_JSONL, Scanner.NUCLEI, ReportType.JSONL, NUCLEI_RESULTS),
        (NUCLEI_TXT, Scanner.NUCLEI, ReportType.TXT, NUCLEI_RESULTS),
    ],
)
def test_detects_and_parses_real_reports(path, scanner, report_type, count):
    file = report(path)
    parser = detect_parser(file)
    assert (parser.scanner, parser.report_type) == (scanner, report_type)
    assert len(parser.parse(file).records) == count


def test_nuclei_jsonl_content_with_json_extension_is_detected():
    file = text_report("results.json", NUCLEI_JSONL.read_text(encoding="utf-8"))
    parser = detect_parser(file)
    assert parser.report_type == ReportType.JSONL


# --- ZAP extraction ------------------------------------------------------------------------

def test_zap_json_fields_are_extracted_from_the_report():
    csp = next(f for f in normalize_all(report(ZAP_JSON)) if f.source_template == "10038")
    assert csp.original_title == "Content Security Policy (CSP) Header Not Set"
    assert csp.original_severity == "Medium"
    assert csp.normalized_severity == Severity.MEDIUM
    assert csp.cwe == "CWE-693"
    assert csp.http_method == "GET"
    assert csp.affected_url == "http://juice:3000"
    assert csp.endpoint == "http://juice:3000/"
    assert csp.description.startswith("Content Security Policy (CSP) is an added layer of security")
    assert "<p>" not in csp.description
    assert csp.recommendation.startswith("Ensure that your web server")
    assert csp.source_reference.splitlines()[0] == "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP"
    assert csp.source_metadata == {
        "alert_ref": "10038-1",
        "confidence": "High",
        "wasc": "WASC-15",
        "site": "http://juice:3000",
        "systemic": True,
    }
    assert csp.raw_record["alert"]["riskdesc"] == "Medium (High)"


def test_zap_absent_values_stay_empty():
    findings = normalize_all(report(ZAP_JSON))
    csp = next(f for f in findings if f.source_template == "10038")
    # Empty strings in the report are not values.
    assert csp.parameter is None
    assert csp.evidence is None
    # Fields ZAP does not provide are never filled in.
    for finding in findings:
        assert finding.owasp is None
        assert finding.cvss_score is None
        assert finding.impact is None
        assert finding.steps_to_reproduce is None
        assert finding.category is None
    # cweid "-1" means "no CWE" in ZAP.
    modern = next(f for f in findings if f.source_template == "10109")
    assert json.loads(ZAP_JSON.read_text(encoding="utf-8"))["site"][0]["alerts"][7]["cweid"] == "-1"
    assert modern.cwe is None


def test_zap_evidence_is_preserved_verbatim():
    raw = json.loads(ZAP_JSON.read_text(encoding="utf-8"))
    raw_evidence = {
        instance["evidence"]
        for alert in raw["site"][0]["alerts"]
        for instance in alert["instances"]
        if instance["evidence"]
    }
    parsed_evidence = {f.evidence for f in normalize_all(report(ZAP_JSON)) if f.evidence}
    assert parsed_evidence == raw_evidence
    assert "Access-Control-Allow-Origin: *" in parsed_evidence


def test_zap_formats_produce_identical_findings():
    def view(path):
        return sorted(
            (f.identity, f.endpoint or "", f.parameter or "", f.http_method or "", f.evidence or "", f.original_severity or "", f.cwe or "")
            for f in normalize_all(report(path))
        )

    assert view(ZAP_JSON) == view(ZAP_XML) == view(ZAP_HTML)
    assert keys(normalize_all(report(ZAP_JSON))) == keys(normalize_all(report(ZAP_HTML)))


def test_zap_html_has_no_confidence_and_does_not_invent_one():
    findings = normalize_all(report(ZAP_HTML))
    assert all("confidence" not in f.source_metadata for f in findings)
    assert all("alert_ref" not in f.source_metadata for f in findings)


def test_zap_scan_date_comes_from_report():
    parser = detect_parser(report(ZAP_JSON))
    parsed = parser.parse(report(ZAP_JSON))
    assert parsed.scan_date.isoformat().startswith("2026-10-07T10:06:46")
    assert parsed.warnings == []


# --- Nuclei extraction ---------------------------------------------------------------------

def test_nuclei_json_fields_are_extracted_from_the_report():
    findings = normalize_all(report(NUCLEI_JSON))
    hsts = next(f for f in findings if f.source_metadata.get("matcher_name") == "strict-transport-security")
    assert hsts.original_title == "HTTP Missing Security Headers"
    assert hsts.normalized_title == "HTTP Missing Security Headers: strict-transport-security"
    assert hsts.original_severity == "info"
    assert hsts.normalized_severity == Severity.INFORMATIONAL
    assert hsts.source_template == "http-missing-security-headers"
    assert hsts.cwe == "CWE-693"
    assert hsts.http_method == "GET"
    assert hsts.affected_url == "http://juice:3000"
    assert hsts.steps_to_reproduce.startswith("curl -X 'GET'")
    assert hsts.cvss_score is None  # not present in this template's classification
    assert hsts.evidence is None  # no extracted-results in this result

    swagger = next(f for f in findings if f.source_template == "swagger-api")
    assert swagger.affected_url == "http://juice:3000/api-docs/swagger.yaml"
    assert swagger.source_reference == "https://swagger.io/"
    assert swagger.description == "Public Swagger API was detected."


def test_nuclei_txt_only_contains_what_the_text_format_has():
    findings = normalize_all(report(NUCLEI_TXT))
    assert len(findings) == NUCLEI_RESULTS
    for finding in findings:
        assert finding.description is None
        assert finding.cwe is None
        assert finding.source_reference is None
        assert finding.steps_to_reproduce is None
        assert finding.http_method is None
    swagger = next(f for f in findings if f.source_template == "swagger-api")
    assert swagger.source_metadata["extra"] == '[paths="/api-docs/swagger.yaml"]'


def test_nuclei_formats_share_finding_identity():
    expected = keys(normalize_all(report(NUCLEI_JSON)))
    assert keys(normalize_all(report(NUCLEI_JSONL))) == expected
    assert keys(normalize_all(report(NUCLEI_TXT))) == expected


def test_nuclei_unknown_severity_is_preserved_but_not_mapped():
    record = json.loads(NUCLEI_JSONL.read_text(encoding="utf-8").splitlines()[0])
    record["info"]["severity"] = "unknown"
    finding = normalize_all(text_report("r.jsonl", json.dumps(record)))[0]
    assert finding.original_severity == "unknown"
    assert finding.normalized_severity is None


# --- normalisation helpers -------------------------------------------------------------------

@pytest.mark.parametrize(
    "value, expected",
    [
        ("High", Severity.HIGH),
        ("high", Severity.HIGH),
        ("CRITICAL", Severity.CRITICAL),
        ("Medium", Severity.MEDIUM),
        ("low", Severity.LOW),
        ("info", Severity.INFORMATIONAL),
        ("Informational", Severity.INFORMATIONAL),
        ("unknown", None),
        ("severe", None),
        ("", None),
        (None, None),
    ],
)
def test_severity_mapping(value, expected):
    assert normalize_severity(value) == expected


@pytest.mark.parametrize("value, expected", [("693", "CWE-693"), ("cwe-79", "CWE-79"), (79, "CWE-79"), ("-1", None), ("0", None), ("", None), (None, None), ("abc", None)])
def test_cwe_formatting(value, expected):
    assert format_cwe(value) == expected


@pytest.mark.parametrize(
    "url, expected",
    [
        ("http://Juice:3000", "http://juice:3000/"),
        ("http://juice:3000/ftp/?a=1#x", "http://juice:3000/ftp"),
        ("https://host/path/", "https://host/path"),
        ("juice:3000", "juice:3000"),
        ("", None),
    ],
)
def test_endpoint_normalisation(url, expected):
    assert endpoint_from_url(url) == expected


def test_fingerprint_ignores_title_wording_and_separates_projects():
    base = fingerprint(1, "OWASP ZAP", "10038:csp", "http://h/", None, "GET")
    assert base == fingerprint(1, "owasp zap", "10038:CSP", "http://h/", "", "get")
    assert base != fingerprint(2, "OWASP ZAP", "10038:csp", "http://h/", None, "GET")
    assert base != fingerprint(1, "OWASP ZAP", "10038:csp", "http://h/other", None, "GET")
    assert base != fingerprint(1, "OWASP ZAP", "10038:csp", "http://h/", "q", "GET")


# --- invalid input ---------------------------------------------------------------------------

def test_malformed_json_is_a_parse_error():
    with pytest.raises(ReportParseError, match="not valid JSON"):
        detect_parser(text_report("bad.json", '{"site": [ {"alerts": '))


def test_truncated_zap_report_is_a_parse_error():
    truncated = ZAP_JSON.read_bytes()[:5000]
    with pytest.raises(ReportParseError):
        detect_parser(text_report("zap.json", truncated))


def test_json_that_is_not_a_report_is_unsupported():
    with pytest.raises(UnsupportedReportError):
        detect_parser(text_report("data.json", '{"name": "not a report", "items": [1, 2]}'))
    with pytest.raises(UnsupportedReportError):
        detect_parser(text_report("empty.json", "[]"))


def test_unrelated_text_and_html_are_unsupported():
    with pytest.raises(UnsupportedReportError):
        detect_parser(text_report("notes.txt", "hello world\nthis is not nuclei output\n"))
    with pytest.raises(UnsupportedReportError):
        detect_parser(text_report("page.html", "<html><head><title>Hi</title></head><body>x</body></html>"))


def test_jsonl_with_a_bad_line_imports_nothing():
    lines = NUCLEI_JSONL.read_text(encoding="utf-8").splitlines()
    corrupted = "\n".join(lines[:3] + ["{not json"] + lines[3:])
    file = text_report("r.jsonl", corrupted)
    parser = detect_parser(file)
    with pytest.raises(ReportParseError, match="Line 4"):
        parser.parse(file)


def test_nuclei_txt_with_foreign_line_imports_nothing():
    text = NUCLEI_TXT.read_text(encoding="utf-8") + "some unrelated line\n"
    file = text_report("r.txt", text)
    with pytest.raises(ReportParseError, match="Line 10"):
        detect_parser(file).parse(file)


def test_xml_entities_are_rejected():
    xxe = '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><OWASPZAPReport>&x;</OWASPZAPReport>'
    file = text_report("zap.xml", xxe)
    with pytest.raises(ReportParseError, match="DTD or entity"):
        detect_parser(file).parse(file)


def test_malformed_xml_is_a_parse_error():
    with pytest.raises(ReportParseError, match="well-formed"):
        detect_parser(text_report("x.xml", "<root><unclosed></root>"))


def test_non_utf8_content_is_a_parse_error():
    with pytest.raises(ReportParseError, match="UTF-8"):
        detect_parser(text_report("x.json", b"\xff\xfe\x00{"))
