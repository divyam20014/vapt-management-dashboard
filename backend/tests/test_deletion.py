"""Admin-only deletion of scans and findings (explicit, audited, transactional)."""

import json

import pytest

from tests.fixtures import NUCLEI_JSONL, NUCLEI_RESULTS, ZAP_DISTINCT_FINDINGS, ZAP_INSTANCES, ZAP_JSON


def upload(client, project_id, path, **data):
    response = client.post(
        "/api/scans/upload",
        data={"project_id": str(project_id), **data},
        files={"file": (path.name, path.read_bytes(), "application/octet-stream")},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def history(client):
    project = client.post("/api/projects", json={"name": "Juice Shop"}).json()
    first = upload(client, project["id"], ZAP_JSON, scan_date="2026-01-01")
    second = upload(client, project["id"], ZAP_JSON, scan_date="2026-02-01", allow_duplicate="true")
    nuclei = upload(client, project["id"], NUCLEI_JSONL, scan_date="2026-03-01")
    return {"project": project, "first": first["scan"]["id"], "second": second["scan"]["id"], "nuclei": nuclei["scan"]["id"]}


def count(sqlite_rows, sql, *params):
    return sqlite_rows(sql, params)[0][0]


def test_deleting_a_scan_removes_only_what_no_other_scan_observed(client, history, sqlite_rows, settings):
    stored = sqlite_rows("SELECT stored_file_path FROM scans WHERE id = ?", (history["nuclei"],))[0][0]
    assert count(sqlite_rows, "SELECT COUNT(*) FROM potential_duplicates") > 0

    response = client.delete(f"/api/scans/{history['nuclei']}")
    assert response.status_code == 200, response.text
    assert (response.json()["findings_removed"], response.json()["findings_kept"]) == (NUCLEI_RESULTS, 0)
    assert count(sqlite_rows, "SELECT COUNT(*) FROM findings WHERE source_tool = 'Nuclei'") == 0
    assert count(sqlite_rows, "SELECT COUNT(*) FROM findings") == ZAP_DISTINCT_FINDINGS
    assert count(sqlite_rows, "SELECT COUNT(*) FROM potential_duplicates") == 0
    assert not (settings.upload_path / stored).exists()
    assert client.get(f"/api/scans/{history['nuclei']}").status_code == 404

    entry = sqlite_rows("SELECT user_id, project_id, details FROM audit_logs WHERE action = 'scan.deleted'")[0]
    assert entry[:2] == (client.admin["id"], history["project"]["id"])
    assert json.loads(entry[2])["file"] == "nuclei.jsonl" and len(json.loads(entry[2])["sha256"]) == 64


def test_findings_seen_elsewhere_keep_status_and_history_but_get_new_dates(client, history, sqlite_rows):
    fid = client.get("/api/findings", params={"search": "Cross-Domain", "page_size": 1}).json()["items"][0]["id"]
    client.put(f"/api/findings/{fid}", json={"status": "In Progress", "comment": "Working on it"})

    response = client.delete(f"/api/scans/{history['first']}").json()
    assert (response["findings_removed"], response["findings_kept"]) == (0, ZAP_DISTINCT_FINDINGS)
    detail = client.get(f"/api/findings/{fid}").json()
    assert detail["status"] == "In Progress"
    assert [h["comment"] for h in detail["status_history"]][0] == "Working on it"
    second = client.get(f"/api/scans/{history['second']}").json()
    assert detail["scan_id"] == history["second"]
    assert detail["first_detected"] == (second["scan_date"] or second["uploaded_at"])  # recalculated from what remains
    assert count(sqlite_rows, "SELECT COUNT(*) FROM finding_occurrences WHERE scan_id = ?", history["first"]) == 0
    assert count(sqlite_rows, "SELECT COUNT(*) FROM finding_occurrences") == ZAP_INSTANCES + NUCLEI_RESULTS


def test_a_failed_deletion_changes_nothing(client, history, sqlite_rows, settings, monkeypatch):
    stored = sqlite_rows("SELECT stored_file_path FROM scans WHERE id = ?", (history["nuclei"],))[0][0]
    before = [count(sqlite_rows, f"SELECT COUNT(*) FROM {t}") for t in ("scans", "findings", "finding_occurrences", "potential_duplicates")]

    def fail(*args, **kwargs):
        raise RuntimeError("audit store unavailable")

    monkeypatch.setattr("app.services.audit_service.record", fail)
    assert client.delete(f"/api/scans/{history['nuclei']}").status_code == 500
    after = [count(sqlite_rows, f"SELECT COUNT(*) FROM {t}") for t in ("scans", "findings", "finding_occurrences", "potential_duplicates")]
    assert after == before
    assert (settings.upload_path / stored).is_file()


def test_deleting_a_finding(client, history, sqlite_rows):
    fid = client.get("/api/findings", params={"search": "swagger", "page_size": 1}).json()["items"][0]["id"]
    response = client.delete(f"/api/findings/{fid}")
    assert response.status_code == 200 and response.json()["title"] == "Public Swagger API - Detect"
    assert client.get(f"/api/findings/{fid}").status_code == 404
    for table in ("finding_occurrences", "finding_status_history"):
        assert count(sqlite_rows, f"SELECT COUNT(*) FROM {table} WHERE finding_id = ?", fid) == 0
    # Scan totals record what the report contained; they are not rewritten.
    assert client.get(f"/api/scans/{history['nuclei']}").json()["total_findings"] == NUCLEI_RESULTS
    assert sqlite_rows("SELECT user_id, finding_id FROM audit_logs WHERE action = 'finding.deleted'") == [(client.admin["id"], fid)]
    assert client.delete(f"/api/findings/{fid}").status_code == 404


def test_only_admins_can_delete(client, history, login_as):
    fid = client.get("/api/findings", params={"page_size": 1}).json()["items"][0]["id"]
    for role in ("Security Analyst", "Viewer"):
        user = login_as(role)
        assert user.delete(f"/api/findings/{fid}").status_code == 403
        assert user.delete(f"/api/scans/{history['nuclei']}").status_code == 403
    assert client.get(f"/api/findings/{fid}").status_code == 200


def test_detection_dates_are_recalculated_from_the_remaining_scans(client):
    """The tracker CSV has no scan date of its own, so the dates given at upload are used."""
    from tests.fixtures import SAMPLE_REPORTS

    tracker = SAMPLE_REPORTS / "tracker" / "findings-tracker.csv"
    project = client.post("/api/projects", json={"name": "Tracker"}).json()
    january = upload(client, project["id"], tracker, scan_date="2026-01-10")["scan"]["id"]
    upload(client, project["id"], tracker, scan_date="2026-02-10", allow_duplicate="true")
    item = client.get("/api/findings", params={"project_id": project["id"], "page_size": 1}).json()["items"][0]
    assert item["first_detected"].startswith("2026-01-10") and item["last_detected"].startswith("2026-02-10")

    client.delete(f"/api/scans/{january}")
    after = client.get(f"/api/findings/{item['id']}").json()
    assert after["first_detected"].startswith("2026-02-10") and after["last_detected"].startswith("2026-02-10")
