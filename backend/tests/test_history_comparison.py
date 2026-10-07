"""Scan history, comparison and dashboard, verified against real uploads and direct SQLite queries.

Controlled scan sequences are built from the real ZAP report by keeping a subset of its alerts
(records are copied verbatim; only the report date and the selection change).
"""

import json

import pytest
from fastapi.testclient import TestClient

from tests.fixtures import NUCLEI_JSONL, ZAP_JSON

CSP, CROSS_DOMAIN, TIMESTAMP, MODERN = "10038", "10098", "10096", "10109"


def zap_report(plugins: set[str], created: str) -> bytes:
    report = json.loads(ZAP_JSON.read_text(encoding="utf-8"))
    report["created"] = created
    for site in report["site"]:
        site["alerts"] = [alert for alert in site["alerts"] if alert["pluginid"] in plugins]
    return json.dumps(report).encode()


def upload(client: TestClient, project_id: int, name: str, content: bytes, headers=None) -> dict:
    response = client.post(
        "/api/scans/upload",
        data={"project_id": str(project_id)},
        files={"file": (name, content, "application/json")},
        headers=headers or {},
    )
    assert response.status_code == 201, response.text
    return response.json()["scan"]


@pytest.fixture
def history(client, make_project):
    """Three weekly ZAP scans of one project:
    S1: CSP, Cross-Domain, Timestamp   S2: CSP, Timestamp   S3: CSP, Cross-Domain, Modern Web
    """
    project = make_project(name="Juice Shop")
    s1 = upload(client, project["id"], "week1.json", zap_report({CSP, CROSS_DOMAIN, TIMESTAMP}, "2026-09-01T09:00:00Z"))
    s2 = upload(client, project["id"], "week2.json", zap_report({CSP, TIMESTAMP}, "2026-09-08T09:00:00Z"))
    s3 = upload(client, project["id"], "week3.json", zap_report({CSP, CROSS_DOMAIN, MODERN}, "2026-09-15T09:00:00Z"))
    return {"project": project["id"], "s1": s1, "s2": s2, "s3": s3}


def compare(client, base, current, **kwargs):
    response = client.get("/api/scans/compare", params={"base_scan_id": base, "compare_scan_id": current}, **kwargs)
    assert response.status_code == 200, response.text
    return response.json()


def by_plugin(result) -> dict[str, set[str]]:
    groups: dict[str, set[str]] = {}
    for item in result["items"]:
        groups.setdefault(item["finding"]["source_template"], set()).add(item["classification"])
    return groups


def findings_in_scan(sqlite_rows, scan_id) -> set[int]:
    return {row[0] for row in sqlite_rows("SELECT DISTINCT finding_id FROM finding_occurrences WHERE scan_id = ?", (scan_id,))}


# --- comparison ---------------------------------------------------------------------------

def test_comparison_classifies_by_fingerprint(client, history, sqlite_rows):
    result = compare(client, history["s2"]["id"], history["s3"]["id"])
    assert result["reordered"] is False and result["warnings"] == []
    assert by_plugin(result) == {CSP: {"Persistent"}, TIMESTAMP: {"Resolved"}, CROSS_DOMAIN: {"Reopened"}, MODERN: {"New"}}

    # Classification sets equal the set algebra over stored occurrences.
    s1, s2, s3 = (findings_in_scan(sqlite_rows, history[k]["id"]) for k in ("s1", "s2", "s3"))
    got = {kind: {i["finding"]["id"] for i in result["items"] if i["classification"] == kind} for kind in ("New", "Resolved", "Persistent", "Reopened")}
    assert got["Persistent"] == s2 & s3
    assert got["Resolved"] == s2 - s3
    assert got["Reopened"] == (s3 - s2) & s1
    assert got["New"] == (s3 - s2) - s1
    assert result["counts"] == {k.lower(): len(v) for k, v in got.items()}


def test_comparison_explains_each_classification(client, history):
    result = compare(client, history["s2"]["id"], history["s3"]["id"])
    reopened = next(i for i in result["items"] if i["classification"] == "Reopened")
    assert reopened["last_seen_before_base"]["id"] == history["s1"]["id"]
    assert "week1.json" in reopened["reason"] and "week2.json" in reopened["reason"] and "week3.json" in reopened["reason"]
    new = next(i for i in result["items"] if i["classification"] == "New")
    assert "no earlier scan" in new["reason"] and new["base_observations"] == 0 and new["compare_observations"] >= 1
    resolved = next(i for i in result["items"] if i["classification"] == "Resolved")
    assert resolved["compare_observations"] == 0 and "not in" in resolved["reason"]
    persistent = next(i for i in result["items"] if i["classification"] == "Persistent")
    assert persistent["base_observations"] >= 1 and persistent["compare_observations"] >= 1


def test_comparison_of_non_adjacent_scans(client, history):
    result = compare(client, history["s1"]["id"], history["s3"]["id"])
    assert by_plugin(result) == {CSP: {"Persistent"}, CROSS_DOMAIN: {"Persistent"}, TIMESTAMP: {"Resolved"}, MODERN: {"New"}}


def test_scans_are_ordered_by_scan_date_not_selection(client, history):
    result = compare(client, history["s3"]["id"], history["s2"]["id"])
    assert result["reordered"] is True
    assert (result["base"]["id"], result["compare"]["id"]) == (history["s2"]["id"], history["s3"]["id"])
    assert any("swapped" in warning for warning in result["warnings"])
    assert by_plugin(result)[CROSS_DOMAIN] == {"Reopened"}


def test_a_title_change_alone_is_not_a_resolution(client, make_project, sqlite_rows):
    """The same ZAP check renamed between reports (as happens across ZAP versions) stays Persistent."""
    project = make_project(name="Titles")
    first = upload(client, project["id"], "a.json", zap_report({CSP, TIMESTAMP}, "2026-09-01T09:00:00Z"))
    report = json.loads(zap_report({CSP, TIMESTAMP}, "2026-09-08T09:00:00Z"))
    csp = next(alert for alert in report["site"][0]["alerts"] if alert["pluginid"] == CSP)
    csp["alert"] = csp["name"] = "Content Security Policy Header Missing"  # test-only rename
    second = upload(client, project["id"], "b.json", json.dumps(report).encode())

    result = compare(client, first["id"], second["id"])
    assert {i["classification"] for i in result["items"]} == {"Persistent"}
    renamed = [i for i in result["items"] if i["renamed_from"]]
    csp_endpoints = sqlite_rows(
        "SELECT COUNT(DISTINCT endpoint) FROM findings WHERE source_template = ? AND project_id = ?", (CSP, project["id"])
    )[0][0]
    assert len(renamed) == csp_endpoints
    assert all(i["renamed_from"]["title"] == "Content Security Policy (CSP) Header Not Set" for i in renamed)
    assert all("title changed" in i["reason"] for i in renamed)
    assert result["counts"] == {"new": 0, "resolved": 0, "persistent": len(result["items"]), "reopened": 0}
    # Records are not merged: both titles still exist as separate findings.
    assert sqlite_rows(
        "SELECT COUNT(DISTINCT normalized_title) FROM findings WHERE source_template = ? AND project_id = ?", (CSP, project["id"])
    ) == [(2,)]


def test_an_unchanged_report_is_entirely_persistent(client, make_project):
    project = make_project(name="Same")
    first = upload(client, project["id"], "a.json", zap_report({CSP}, "2026-09-01T09:00:00Z"))
    second = upload(client, project["id"], "b.json", zap_report({CSP}, "2026-09-08T09:00:00Z"))
    result = compare(client, first["id"], second["id"])
    assert {i["classification"] for i in result["items"]} == {"Persistent"}
    assert all(i["renamed_from"] is None for i in result["items"])


def test_comparison_flags_status_conflicts_without_changing_status(client, history, sqlite_rows):
    alice = client.admin  # the signed-in user records the changes
    headers = {}
    cross_domain = sqlite_rows("SELECT id FROM findings WHERE source_template = ? LIMIT 1", (CROSS_DOMAIN,))[0][0]
    client.put(f"/api/findings/{cross_domain}", json={"status": "Resolved"}, headers=headers)

    result = compare(client, history["s2"]["id"], history["s3"]["id"], headers=headers)
    item = next(i for i in result["items"] if i["finding"]["id"] == cross_domain)
    assert item["classification"] == "Reopened"
    assert item["attention"].startswith("Marked Resolved, but detected in")
    resolved = next(i for i in result["items"] if i["classification"] == "Resolved")
    assert "status is still Open" in resolved["attention"]
    persistent = next(i for i in result["items"] if i["classification"] == "Persistent")
    assert persistent["attention"] is None

    # Nothing changed automatically.
    assert sqlite_rows("SELECT status FROM findings WHERE id = ?", (cross_domain,)) == [("Resolved",)]
    assert sqlite_rows("SELECT COUNT(*) FROM findings WHERE status = 'Reopened'") == [(0,)]
    audit = sqlite_rows("SELECT user_id, details FROM audit_logs WHERE action = 'scans.compared'")
    assert len(audit) == 1 and audit[0][0] == alice["id"]
    assert json.loads(audit[0][1])["reopened"] == result["counts"]["reopened"]


def test_comparison_across_tools_warns(client, make_project):
    project = make_project(name="Mixed")
    zap = upload(client, project["id"], "zap.json", zap_report({CSP}, "2026-09-01T09:00:00Z"))
    nuclei = upload(client, project["id"], "n.jsonl", NUCLEI_JSONL.read_bytes())
    result = compare(client, zap["id"], nuclei["id"])
    assert any("different tools" in warning for warning in result["warnings"])


def test_invalid_comparisons(client, history, make_project):
    other = make_project(name="Other")
    other_scan = upload(client, other["id"], "x.json", zap_report({CSP}, "2026-09-01T09:00:00Z"))
    failed = client.post(
        "/api/scans/upload", data={"project_id": str(history["project"])}, files={"file": ("bad.json", b"{", "application/json")}
    ).json()["error"]["details"]["scan_id"]
    s2 = history["s2"]["id"]
    for base, current, message in [
        (s2, s2, "two different scans"),
        (s2, other_scan["id"], "same project"),
        (s2, failed, "failed to process"),
    ]:
        response = client.get("/api/scans/compare", params={"base_scan_id": base, "compare_scan_id": current})
        assert response.status_code == 422
        assert message in response.json()["error"]["message"]
    assert client.get("/api/scans/compare", params={"base_scan_id": s2, "compare_scan_id": 999}).status_code == 404


# --- scan history ---------------------------------------------------------------------------

def test_global_scan_list_is_newest_first_and_filterable(client, history, make_project):
    other = make_project(name="Other")
    upload(client, other["id"], "other.json", zap_report({MODERN}, "2026-08-01T09:00:00Z"))
    items = client.get("/api/scans").json()["items"]
    assert [scan["scan_name"] for scan in items] == ["week3.json", "week2.json", "week1.json", "other.json"]
    assert [s["scan_name"] for s in client.get("/api/scans", params={"project_id": other["id"]}).json()["items"]] == ["other.json"]
    assert client.get("/api/scans", params={"scanner": "Nuclei"}).json()["total"] == 0
    assert client.get("/api/scans", params={"date_from": "2026-09-05", "date_to": "2026-09-10"}).json()["items"][0]["scan_name"] == "week2.json"
    oldest = client.get("/api/scans", params={"sort_order": "asc", "page_size": 1}).json()
    assert oldest["items"][0]["scan_name"] == "other.json" and oldest["total"] == 4


def test_scan_detail_links_neighbouring_scans(client, history):
    detail = client.get(f"/api/scans/{history['s2']['id']}").json()
    assert detail["previous_scan"]["id"] == history["s1"]["id"]
    assert detail["next_scan"]["id"] == history["s3"]["id"]
    first = client.get(f"/api/scans/{history['s1']['id']}").json()
    assert first["previous_scan"] is None


def test_findings_can_be_filtered_by_scan(client, history, sqlite_rows):
    for key in ("s1", "s2", "s3"):
        scan = history[key]
        body = client.get("/api/findings", params={"scan_id": scan["id"], "page_size": 100}).json()
        assert body["total"] == scan["total_findings"] == len(findings_in_scan(sqlite_rows, scan["id"]))


def test_original_report_download(client, history, settings, sqlite_rows):
    scan_id = history["s1"]["id"]
    response = client.get(f"/api/scans/{scan_id}/original")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert 'attachment; filename="week1.json"' in response.headers["content-disposition"]
    stored = sqlite_rows("SELECT stored_file_path FROM scans WHERE id = ?", (scan_id,))[0][0]
    assert response.content == (settings.upload_path / stored).read_bytes()

    (settings.upload_path / stored).unlink()
    missing = client.get(f"/api/scans/{scan_id}/original")
    assert missing.status_code == 410
    assert str(settings.upload_path) not in missing.text
    assert client.get("/api/scans/999/original").status_code == 404


# --- dashboard ------------------------------------------------------------------------------

@pytest.fixture
def portfolio(client, make_project):
    """Two projects with real reports, one including Critical/High results (test-only severity edits)."""
    alice = client.admin  # the signed-in user records the changes
    headers = {}
    a = make_project(name="Alpha")
    b = make_project(name="Beta")
    upload(client, a["id"], "zap-jan.json", zap_report({CSP, TIMESTAMP}, "2026-01-10T09:00:00Z"), headers)
    upload(client, a["id"], "zap-sep.json", zap_report({CSP, CROSS_DOMAIN}, "2026-09-10T09:00:00Z"), headers)
    lines = NUCLEI_JSONL.read_text(encoding="utf-8").splitlines()
    mutated = []
    for line, severity in zip(lines[:3], ["critical", "high", "high"]):
        record = json.loads(line)
        record["info"]["severity"] = severity
        mutated.append(json.dumps(record))
    upload(client, b["id"], "nuclei.jsonl", "\n".join(mutated).encode(), headers)
    return {"a": a["id"], "b": b["id"], "headers": headers}


SEVERITY_KEYS = {"Critical": "critical", "High": "high", "Medium": "medium", "Low": "low", "Informational": "informational", None: "unclassified"}


def sql_severity(sqlite_rows, where="1=1", params=()):
    rows = dict(sqlite_rows(f"SELECT normalized_severity, COUNT(*) FROM findings WHERE {where} GROUP BY normalized_severity", params))
    return {key: rows.get(level, 0) for level, key in SEVERITY_KEYS.items()}


def test_dashboard_totals_match_sqlite(client, portfolio, sqlite_rows):
    summary = client.get("/api/dashboard/summary").json()
    assert summary["project_count"] == sqlite_rows("SELECT COUNT(*) FROM projects")[0][0] == 2
    assert summary["scan_count"] == sqlite_rows("SELECT COUNT(*) FROM scans WHERE processing_status = 'Completed'")[0][0] == 3
    assert summary["finding_count"] == sqlite_rows("SELECT COUNT(*) FROM findings")[0][0]
    assert summary["findings_by_severity"] == sql_severity(sqlite_rows)
    assert summary["findings_by_severity"]["critical"] == 1 and summary["findings_by_severity"]["high"] == 2
    statuses = dict(sqlite_rows("SELECT status, COUNT(*) FROM findings GROUP BY status"))
    assert {row["status"]: row["count"] for row in summary["status_summary"] if row["count"]} == statuses

    by_project = {row["project_name"]: row for row in summary["findings_by_project"]}
    for name, pid in (("Alpha", portfolio["a"]), ("Beta", portfolio["b"])):
        assert by_project[name]["total"] == sqlite_rows("SELECT COUNT(*) FROM findings WHERE project_id = ?", (pid,))[0][0]
        assert by_project[name]["severity"] == sql_severity(sqlite_rows, "project_id = ?", (pid,))
    assert summary["findings_by_project"][0]["total"] >= summary["findings_by_project"][-1]["total"]

    cwe_rows = dict(sqlite_rows("SELECT cwe, COUNT(*) FROM findings WHERE cwe IS NOT NULL GROUP BY cwe"))
    assert {row["cwe"]: row["count"] for row in summary["top_cwes"]} == cwe_rows
    assert summary["top_categories"] == []  # neither scanner reports a category

    assert [f["normalized_severity"] for f in summary["recent_critical_high"]] == ["Critical", "High", "High"]
    assert summary["latest_scan"]["scan_name"] in ("zap-sep.json", "nuclei.jsonl")
    assert summary["indicators"]["active_critical_high"] == 3
    assert summary["indicators"]["active_findings"] == summary["finding_count"]
    assert summary["indicators"]["unassigned_active"] == summary["finding_count"]


def test_indicators_follow_workflow_changes(client, portfolio, sqlite_rows):
    critical = sqlite_rows("SELECT id FROM findings WHERE normalized_severity = 'Critical'")[0][0]
    alice_id = client.admin["id"]
    client.put(f"/api/findings/{critical}", json={"status": "Resolved", "assigned_to": alice_id}, headers=portfolio["headers"])
    summary = client.get("/api/dashboard/summary").json()
    assert summary["indicators"]["active_critical_high"] == 2
    assert summary["indicators"]["resolved_last_30_days"] == 1
    assert summary["active_by_severity"]["critical"] == 0
    assert summary["findings_by_severity"]["critical"] == 1  # still counted in totals
    assert {r["status"]: r["count"] for r in summary["status_summary"]}["Resolved"] == 1


def test_project_dashboard_is_isolated(client, portfolio, sqlite_rows):
    alpha = client.get("/api/dashboard/summary", params={"project_id": portfolio["a"]}).json()
    assert alpha["project_id"] == portfolio["a"] and alpha["project_count"] == 1
    assert alpha["scan_count"] == 2
    assert alpha["findings_by_severity"] == sql_severity(sqlite_rows, "project_id = ?", (portfolio["a"],))
    assert alpha["recent_critical_high"] == []
    assert {scan["project_id"] for scan in alpha["recent_scans"]} == {portfolio["a"]}
    assert alpha["latest_scan"]["scan_name"] == "zap-sep.json"
    assert client.get("/api/dashboard/severity", params={"project_id": portfolio["b"]}).json() == sql_severity(sqlite_rows, "project_id = ?", (portfolio["b"],))
    assert client.get("/api/dashboard/summary", params={"project_id": 999}).status_code == 404


def test_trends_match_sqlite(client, portfolio, sqlite_rows):
    trends = client.get("/api/dashboard/trends").json()
    assert trends["granularity"] == "month"  # January to September spans more than 92 days
    discovered = dict(sqlite_rows("SELECT strftime('%Y-%m', first_detected), COUNT(*) FROM findings GROUP BY 1"))
    points = {p["period"]: p for p in trends["points"]}
    assert {period: p["discovered"] for period, p in points.items() if p["discovered"]} == discovered
    assert list(points) == sorted(points) and "2026-05" in points and points["2026-05"]["discovered"] == 0

    project_trends = client.get("/api/dashboard/trends", params={"project_id": portfolio["b"]}).json()
    assert project_trends["granularity"] == "day"
    assert sum(p["discovered"] for p in project_trends["points"]) == 3


def test_trends_count_resolutions(client, portfolio, sqlite_rows):
    ids = [row[0] for row in sqlite_rows("SELECT id FROM findings WHERE project_id = ?", (portfolio["b"],))]
    client.post("/api/findings/bulk-update", json={"finding_ids": ids, "status": "Closed"}, headers=portfolio["headers"])
    points = client.get("/api/dashboard/trends", params={"project_id": portfolio["b"]}).json()["points"]
    assert sum(p["resolved"] for p in points) == 3


def test_findings_by_project_endpoint(client, portfolio):
    rows = client.get("/api/dashboard/projects").json()
    assert {row["project_name"] for row in rows} == {"Alpha", "Beta"}
    assert len(client.get("/api/dashboard/projects", params={"limit": 1}).json()) == 1


def test_comparison_warns_when_a_scan_has_no_findings(client, make_project):
    project = make_project(name="Empty current")
    full = upload(client, project["id"], "full.json", zap_report({CSP, TIMESTAMP}, "2026-09-01T09:00:00Z"))
    empty = upload(client, project["id"], "empty.json", zap_report(set(), "2026-09-08T09:00:00Z"))
    assert empty["total_findings"] == 0
    result = compare(client, full["id"], empty["id"])
    assert result["counts"]["resolved"] == full["total_findings"]
    assert any("current scan" in w and "contains no findings" in w and "Resolved" in w for w in result["warnings"])

    reverse = compare(client, empty["id"], full["id"])  # reordered to the same direction
    assert any("contains no findings" in w for w in reverse["warnings"])


def test_no_empty_scan_warning_for_normal_comparisons(client, history):
    result = compare(client, history["s2"]["id"], history["s3"]["id"])
    assert not any("contains no findings" in w for w in result["warnings"])
