from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from app.main import create_app
from tests.fixtures import (
    NUCLEI_JSONL,
    NUCLEI_RESULTS,
    NUCLEI_TXT,
    ZAP_DISTINCT_FINDINGS,
    ZAP_HTML,
    ZAP_INSTANCES,
    ZAP_JSON,
    ZAP_SEVERITY,
)


@pytest.fixture
def project(make_project) -> dict:
    return make_project(name="Juice Shop")


def upload(client: TestClient, project_id: int, path: Path | None = None, *, name: str | None = None,
           content: bytes | None = None, content_type: str = "application/octet-stream", **form):
    data = {"project_id": str(project_id), **{key: str(value).lower() if isinstance(value, bool) else str(value) for key, value in form.items()}}
    body = content if content is not None else path.read_bytes()
    return client.post("/api/scans/upload", data=data, files={"file": (name or path.name, body, content_type)})


def count(sqlite_rows, table: str) -> int:
    return sqlite_rows(f"SELECT COUNT(*) FROM {table}")[0][0]


def stored_files(settings) -> list[Path]:
    return [path for path in settings.upload_path.rglob("*") if path.is_file()]


# --- successful upload ---------------------------------------------------------------------

def test_zap_upload_parses_normalizes_and_stores(client, project, sqlite_rows, settings):
    response = upload(client, project["id"], ZAP_JSON, content_type="application/json", scan_name="Baseline #1")
    assert response.status_code == 201, response.text
    result = response.json()

    assert result["parser"] == "OWASP ZAP JSON"
    assert result["records_parsed"] == ZAP_INSTANCES
    assert result["new_findings"] == ZAP_DISTINCT_FINDINGS
    assert result["existing_findings"] == 0
    assert result["severity_counts"] == {"critical": 0, "high": 0, "unclassified": 0, **ZAP_SEVERITY}
    assert result["potential_duplicates"] == []

    scan = result["scan"]
    assert scan["scan_name"] == "Baseline #1"
    assert scan["scanner"] == "OWASP ZAP"
    assert scan["report_type"] == "JSON"
    assert scan["processing_status"] == "Completed"
    assert scan["scan_date"].startswith("2026-10-07T10:06:46")
    assert scan["total_findings"] == ZAP_DISTINCT_FINDINGS
    assert (scan["medium_count"], scan["low_count"], scan["informational_count"]) == (9, 17, 13)
    assert "stored_file_path" not in scan and "file_hash" not in scan

    # Database matches the summary.
    assert count(sqlite_rows, "findings") == ZAP_DISTINCT_FINDINGS
    assert count(sqlite_rows, "finding_occurrences") == ZAP_INSTANCES
    assert dict(sqlite_rows("SELECT normalized_severity, COUNT(*) FROM findings GROUP BY normalized_severity")) == {
        "Medium": 9, "Low": 17, "Informational": 13,
    }
    row = sqlite_rows(
        "SELECT original_title, original_severity, normalized_severity, cwe, status, source_tool, source_template, owasp, cvss_score "
        "FROM findings WHERE source_template = '10038' AND endpoint = 'http://juice:3000/'"
    )
    assert row == [("Content Security Policy (CSP) Header Not Set", "Medium", "Medium", "CWE-693", "Open", "OWASP ZAP", "10038", None, None)]
    assert sqlite_rows("SELECT DISTINCT cwe FROM findings WHERE source_template = '10109'") == [(None,)]


def test_original_report_is_retained_byte_for_byte(client, project, settings, sqlite_rows):
    upload(client, project["id"], ZAP_JSON)
    files = stored_files(settings)
    assert len(files) == 1
    assert files[0].read_bytes() == ZAP_JSON.read_bytes()
    relative = files[0].relative_to(settings.upload_path).as_posix()
    assert relative.startswith(f"{project['id']}/")
    assert relative.endswith("_zap-baseline.json")
    assert sqlite_rows("SELECT stored_file_path, original_filename FROM scans") == [(relative, "zap-baseline.json")]


def test_evidence_is_stored_unchanged(client, project, sqlite_rows):
    upload(client, project["id"], ZAP_JSON)
    evidence = {row[0] for row in sqlite_rows("SELECT evidence FROM finding_occurrences WHERE evidence IS NOT NULL")}
    assert "Access-Control-Allow-Origin: *" in evidence


def test_nuclei_upload_and_cross_tool_potential_duplicates(client, project, sqlite_rows):
    upload(client, project["id"], ZAP_JSON)
    response = upload(client, project["id"], NUCLEI_JSONL)
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["parser"] == "Nuclei JSONL"
    assert result["new_findings"] == NUCLEI_RESULTS
    assert result["severity_counts"]["informational"] == NUCLEI_RESULTS

    pairs = {(d["finding_title"], d["candidate_title"], d["confidence"]) for d in result["potential_duplicates"]}
    assert pairs == {
        ("HTTP Missing Security Headers: content-security-policy", "Content Security Policy (CSP) Header Not Set", "Medium"),
        ("HTTP Missing Security Headers: cross-origin-embedder-policy", "Cross-Origin-Embedder-Policy Header Missing or Invalid", "Medium"),
        ("HTTP Missing Security Headers: cross-origin-opener-policy", "Cross-Origin-Opener-Policy Header Missing or Invalid", "Medium"),
    }
    # Candidates are recorded for review only: nothing is merged.
    assert count(sqlite_rows, "potential_duplicates") == 3
    assert sqlite_rows("SELECT DISTINCT decision FROM potential_duplicates") == [("Pending",)]
    assert count(sqlite_rows, "findings") == ZAP_DISTINCT_FINDINGS + NUCLEI_RESULTS


def test_same_scan_in_another_format_creates_no_new_findings(client, project, sqlite_rows):
    upload(client, project["id"], ZAP_JSON)
    result = upload(client, project["id"], ZAP_HTML).json()
    assert result["parser"] == "OWASP ZAP HTML"
    assert result["new_findings"] == 0
    assert result["existing_findings"] == ZAP_DISTINCT_FINDINGS
    assert count(sqlite_rows, "findings") == ZAP_DISTINCT_FINDINGS
    assert count(sqlite_rows, "finding_occurrences") == 2 * ZAP_INSTANCES


def test_nuclei_text_report_warns_about_missing_fields(client, project):
    result = upload(client, project["id"], NUCLEI_TXT, content_type="text/plain").json()
    assert result["parser"] == "Nuclei TXT"
    assert result["scan"]["scan_date"] is None
    assert any("no descriptions" in warning for warning in result["warnings"])


def test_scan_date_entered_by_user_is_used_only_when_report_has_none(client, project):
    txt = upload(client, project["id"], NUCLEI_TXT, scan_date="2026-09-30").json()
    assert txt["scan"]["scan_date"].startswith("2026-09-30")
    zap = upload(client, project["id"], ZAP_JSON, scan_date="2026-01-01").json()
    assert zap["scan"]["scan_date"].startswith("2026-10-07")
    assert any("date entered on upload was ignored" in warning for warning in zap["warnings"])


# --- duplicate upload ----------------------------------------------------------------------

def test_duplicate_upload_is_rejected_with_warning(client, project, sqlite_rows, settings):
    first = upload(client, project["id"], ZAP_JSON).json()
    response = upload(client, project["id"], ZAP_JSON)
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "duplicate_upload"
    assert error["details"]["existing_scan"]["id"] == first["scan"]["id"]
    assert count(sqlite_rows, "scans") == 1
    assert count(sqlite_rows, "finding_occurrences") == ZAP_INSTANCES
    assert len(stored_files(settings)) == 1


def test_duplicate_upload_can_be_confirmed_without_duplicating_findings(client, project, sqlite_rows):
    upload(client, project["id"], ZAP_JSON)
    response = upload(client, project["id"], ZAP_JSON, allow_duplicate=True)
    assert response.status_code == 201
    assert response.json()["new_findings"] == 0
    assert count(sqlite_rows, "scans") == 2
    assert count(sqlite_rows, "findings") == ZAP_DISTINCT_FINDINGS


def test_same_report_in_another_project_is_not_a_duplicate(client, project, make_project, sqlite_rows):
    other = make_project(name="Other")
    upload(client, project["id"], ZAP_JSON)
    assert upload(client, other["id"], ZAP_JSON).status_code == 201
    # Findings are isolated per project.
    assert dict(sqlite_rows("SELECT project_id, COUNT(*) FROM findings GROUP BY project_id")) == {
        project["id"]: ZAP_DISTINCT_FINDINGS,
        other["id"]: ZAP_DISTINCT_FINDINGS,
    }


# --- rejected uploads (nothing stored) -----------------------------------------------------

@pytest.mark.parametrize(
    "name, content, content_type, status, code",
    [
        ("malware.exe", b"MZ\x90\x00", "application/octet-stream", 415, "unsupported_media_type"),
        ("report.pdf", b"%PDF-1.7", "application/pdf", 415, "unsupported_media_type"),
        ("report", b"{}", "application/json", 415, "unsupported_media_type"),
        ("report.json", b"MZ\x90\x00binary", "application/json", 415, "unsupported_media_type"),
        ("report.json", b'{"a": 1}', "application/pdf", 415, "unsupported_media_type"),
        ("report.json", b"{\x00\x00}", "application/json", 415, "unsupported_media_type"),
        ("../../etc/passwd.json", b"{}", "application/json", 400, "invalid_upload"),
        ("..\\..\\evil.json", b"{}", "application/json", 400, "invalid_upload"),
        ("C:evil.json", b"{}", "application/json", 400, "invalid_upload"),
        ("/abs/evil.json", b"{}", "application/json", 400, "invalid_upload"),
        ("..json", b"{}", "application/json", 400, "invalid_upload"),
        ("empty.json", b"   \n", "application/json", 400, "invalid_upload"),
    ],
)
def test_invalid_uploads_are_rejected_and_not_stored(client, project, sqlite_rows, settings, name, content, content_type, status, code):
    response = upload(client, project["id"], name=name, content=content, content_type=content_type)
    assert response.status_code == status, response.text
    assert response.json()["error"]["code"] == code
    assert count(sqlite_rows, "scans") == 0
    assert stored_files(settings) == []


def test_oversized_upload_is_rejected(settings, tmp_path):
    settings.max_upload_size_mb = 1
    with TestClient(create_app(settings)) as client:
        project_id = client.post("/api/projects", json={"name": "P"}).json()["id"]
        response = upload(client, project_id, name="big.json", content=b"[" + b" " * (1024 * 1024) + b"]")
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "file_too_large"
    assert stored_files(settings) == []


def test_upload_to_missing_project_is_404(client):
    response = upload(client, 999, ZAP_JSON)
    assert response.status_code == 404


def test_upload_requires_file_and_project(client):
    response = client.post("/api/scans/upload", data={})
    assert response.status_code == 422
    fields = {detail["field"] for detail in response.json()["error"]["details"]}
    assert {"project_id", "file"} <= fields


# --- reports that fail to parse (recorded as failed scans) ---------------------------------

@pytest.mark.parametrize(
    "name, content, code, message",
    [
        ("broken.json", b'{"site": [', "parse_error", "not valid JSON"),
        ("other.json", b'{"name": "inventory", "items": []}', "unsupported_report", "not recognised"),
        ("truncated.json", ZAP_JSON.read_bytes()[:4000], "parse_error", "not valid JSON"),
        ("random.txt", b"just some notes\n", "unsupported_report", "not recognised"),
        ("broken.xml", b"<OWASPZAPReport><site>", "parse_error", "not well-formed"),
    ],
)
def test_unparseable_reports_record_a_failed_scan_without_findings(client, project, sqlite_rows, settings, name, content, code, message):
    response = upload(client, project["id"], name=name, content=content)
    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == code
    assert message in error["message"]
    assert "Traceback" not in response.text and str(settings.upload_path) not in response.text

    scan_id = error["details"]["scan_id"]
    status, stored_error, total = sqlite_rows("SELECT processing_status, processing_error, total_findings FROM scans WHERE id = ?", (scan_id,))[0]
    assert (status, total) == ("Failed", 0)
    assert message in stored_error
    assert count(sqlite_rows, "findings") == 0
    assert len(stored_files(settings)) == 1  # original retained for investigation


def test_database_failure_rolls_back_all_findings(client, project, sqlite_rows, monkeypatch):
    def fail(*args, **kwargs):
        raise SQLAlchemyError("simulated failure")

    monkeypatch.setattr("app.services.duplicate_service.detect_potential_duplicates", fail)
    response = upload(client, project["id"], ZAP_JSON)
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "processing_failed"
    assert count(sqlite_rows, "findings") == 0
    assert count(sqlite_rows, "finding_occurrences") == 0
    assert sqlite_rows("SELECT processing_status FROM scans") == [("Failed",)]


# --- scans API, dashboard, project deletion ------------------------------------------------

def test_project_scans_are_listed_newest_first(client, project):
    first = upload(client, project["id"], ZAP_JSON).json()["scan"]["id"]
    second = upload(client, project["id"], NUCLEI_JSONL).json()["scan"]["id"]
    body = client.get(f"/api/projects/{project['id']}/scans").json()
    assert [scan["id"] for scan in body["items"]] == [second, first]
    assert body["total"] == 2
    assert client.get(f"/api/scans/{first}").json()["scanner"] == "OWASP ZAP"
    assert client.get("/api/scans/999").status_code == 404
    assert client.get("/api/projects/999/scans").status_code == 404


def test_dashboard_reflects_uploaded_reports(client, project, sqlite_rows):
    upload(client, project["id"], ZAP_JSON)
    upload(client, project["id"], NUCLEI_JSONL)
    upload(client, project["id"], name="bad.json", content=b"{")
    summary = client.get("/api/dashboard/summary").json()

    assert summary["scan_count"] == 2
    assert summary["failed_scan_count"] == 1
    assert summary["finding_count"] == count(sqlite_rows, "findings") == ZAP_DISTINCT_FINDINGS + NUCLEI_RESULTS
    by_severity = dict(sqlite_rows("SELECT normalized_severity, COUNT(*) FROM findings GROUP BY normalized_severity"))
    assert summary["findings_by_severity"] == {
        "critical": 0,
        "high": 0,
        "medium": by_severity["Medium"],
        "low": by_severity["Low"],
        "informational": by_severity["Informational"],
        "unclassified": 0,
    }
    assert [scan["processing_status"] for scan in summary["recent_scans"]] == ["Failed", "Completed", "Completed"]


def test_unclassified_severity_is_counted_separately(client, project):
    import json

    record = json.loads(NUCLEI_JSONL.read_text(encoding="utf-8").splitlines()[0])
    record["info"]["severity"] = "unknown"
    result = upload(client, project["id"], name="u.jsonl", content=json.dumps(record).encode()).json()
    assert result["severity_counts"]["unclassified"] == 1
    assert result["scan"]["total_findings"] == 1
    assert client.get("/api/dashboard/summary").json()["findings_by_severity"]["unclassified"] == 1


def test_project_with_reports_cannot_be_deleted(client, project, sqlite_rows):
    upload(client, project["id"], ZAP_JSON)
    response = client.delete(f"/api/projects/{project['id']}")
    assert response.status_code == 409
    assert "Archive it instead" in response.json()["error"]["message"]
    assert count(sqlite_rows, "projects") == 1


def test_settings_lists_allowed_extensions(client):
    assert client.get("/api/settings").json()["allowed_extensions"] == [".html", ".htm", ".json", ".jsonl", ".xml", ".txt"]
