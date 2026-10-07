"""Paths to the real scanner reports in sample-reports/ (see sample-reports/README.md)."""

from pathlib import Path

SAMPLE_REPORTS = Path(__file__).resolve().parents[2] / "sample-reports"

ZAP_JSON = SAMPLE_REPORTS / "zap" / "zap-baseline.json"
ZAP_XML = SAMPLE_REPORTS / "zap" / "zap-baseline.xml"
ZAP_HTML = SAMPLE_REPORTS / "zap" / "zap-baseline.html"
NUCLEI_JSON = SAMPLE_REPORTS / "nuclei" / "nuclei.json"
NUCLEI_JSONL = SAMPLE_REPORTS / "nuclei" / "nuclei.jsonl"
NUCLEI_TXT = SAMPLE_REPORTS / "nuclei" / "nuclei.txt"

ALL_FIXTURES = [ZAP_JSON, ZAP_XML, ZAP_HTML, NUCLEI_JSON, NUCLEI_JSONL, NUCLEI_TXT]

# Facts about the fixtures, verified by hand against the files.
ZAP_INSTANCES = 45
ZAP_DISTINCT_FINDINGS = 39  # "http://juice:3000" and "http://juice:3000/" are the same endpoint
ZAP_SEVERITY = {"medium": 9, "low": 17, "informational": 13}
NUCLEI_RESULTS = 9
