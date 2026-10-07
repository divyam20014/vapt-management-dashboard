import json

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import CSRF_HEADERS, TEST_PASSWORD
from tests.fixtures import NUCLEI_JSONL, NUCLEI_RESULTS, ZAP_DISTINCT_FINDINGS, ZAP_JSON

TOTAL = ZAP_DISTINCT_FINDINGS + NUCLEI_RESULTS


def upload(client, project_id, path=None, *, name=None, content=None, headers=None):
    body = content if content is not None else path.read_bytes()
    response = client.post(
        "/api/scans/upload",
        data={"project_id": str(project_id)},
        files={"file": (name or path.name, body, "application/octet-stream")},
        headers=headers or {},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def users(client, login_as):
    """Alice is a signed-in Security Analyst; Bob is an Admin without a password (assignee only)."""
    alice = login_as("Security Analyst", name="Alice Analyst", email="alice@example.com")
    bob = client.post("/api/users", json={"name": "Bob Admin", "email": "bob@example.com", "role": "Admin"})
    assert bob.status_code == 201, bob.text
    return {"alice": {**alice.user, "client": alice}, "bob": bob.json()}


@pytest.fixture
def alice(users):
    return users["alice"]["client"]


@pytest.fixture
def workspace(client, make_project):
    """Project A: real ZAP + Nuclei reports. Project B: the same ZAP report (isolation checks)."""
    a = make_project(name="Juice Shop")
    b = make_project(name="Other App")
    upload(client, a["id"], ZAP_JSON)
    upload(client, a["id"], NUCLEI_JSONL)
    upload(client, b["id"], ZAP_JSON)
    return {"a": a["id"], "b": b["id"]}


def find(client, **params):
    response = client.get("/api/findings", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def finding_id(client, project_id, search):
    items = find(client, project_id=project_id, search=search, page_size=100)["items"]
    assert items, search
    return items[0]["id"]


# --- listing, filters, sort, pagination ---------------------------------------------------

def test_list_is_paginated_on_the_server(client, workspace):
    first = find(client, project_id=workspace["a"], page_size=10)
    assert first["total"] == TOTAL
    assert len(first["items"]) == 10
    seen = []
    for page in range(1, 6):
        seen += [item["id"] for item in find(client, project_id=workspace["a"], page_size=10, page=page)["items"]]
    assert len(seen) == TOTAL == len(set(seen))
    assert find(client, project_id=workspace["a"], page_size=10, page=6)["items"] == []


def test_default_sort_is_severity_descending(client, workspace):
    items = find(client, project_id=workspace["a"], page_size=100)["items"]
    rank = {"Critical": 5, "High": 4, "Medium": 3, "Low": 2, "Informational": 1, None: 0}
    ranks = [rank[item["normalized_severity"]] for item in items]
    assert ranks == sorted(ranks, reverse=True)
    ascending = find(client, project_id=workspace["a"], page_size=100, sort_by="severity", sort_order="asc")["items"]
    assert ascending[0]["normalized_severity"] == "Informational"


@pytest.mark.parametrize("sort_by, key", [("title", "normalized_title"), ("endpoint", "endpoint"), ("source", "source_tool")])
def test_sorting(client, workspace, sort_by, key):
    items = find(client, project_id=workspace["a"], page_size=100, sort_by=sort_by, sort_order="asc")["items"]
    values = [(item[key] or "").lower() if key == "normalized_title" else (item[key] or "") for item in items]
    assert values == sorted(values)


def test_projects_are_isolated(client, workspace):
    assert find(client, project_id=workspace["b"])["total"] == ZAP_DISTINCT_FINDINGS
    assert find(client)["total"] == TOTAL + ZAP_DISTINCT_FINDINGS
    assert {i["project_name"] for i in find(client, project_id=workspace["b"], page_size=100)["items"]} == {"Other App"}


def test_severity_filter(client, workspace):
    medium = find(client, project_id=workspace["a"], severity="Medium", page_size=100)
    assert medium["total"] == 9
    assert {item["normalized_severity"] for item in medium["items"]} == {"Medium"}
    assert find(client, project_id=workspace["a"], severity=["Medium", "Low"])["total"] == 9 + 17
    assert find(client, project_id=workspace["a"], severity=["Critical", "High"])["total"] == 0


def test_source_tool_search_and_cwe_filters(client, workspace):
    assert find(client, project_id=workspace["a"], source_tool="Nuclei")["total"] == NUCLEI_RESULTS
    assert find(client, project_id=workspace["a"], source_tool="OWASP ZAP")["total"] == ZAP_DISTINCT_FINDINGS
    swagger = find(client, project_id=workspace["a"], search="swagger")
    assert [item["source_template"] for item in swagger["items"]] == ["swagger-api"]
    csp = find(client, project_id=workspace["a"], search="Content Security Policy (CSP)", page_size=100)
    assert csp["total"] == 4 and {i["source_tool"] for i in csp["items"]} == {"OWASP ZAP"}
    assert find(client, project_id=workspace["a"], search="CWE-524")["total"] > 0


def test_date_filters(client, workspace):
    assert find(client, project_id=workspace["a"], date_from="2026-10-07", date_to="2026-10-07")["total"] == TOTAL
    assert find(client, project_id=workspace["a"], date_to="2026-10-06")["total"] == 0
    assert find(client, project_id=workspace["a"], date_field="first_detected", date_from="2026-10-08")["total"] == 0


def test_combined_filters(client, workspace, alice, users):
    low_zap = find(client, project_id=workspace["a"], severity="Low", status="Open", source_tool="OWASP ZAP", page_size=100)
    assert low_zap["total"] == 17
    ids = [item["id"] for item in low_zap["items"][:5]]
    alice.post("/api/findings/bulk-update", json={"finding_ids": ids, "status": "In Progress", "assigned_to": users["bob"]["id"]})

    assert find(client, project_id=workspace["a"], severity="Low", status="Open", source_tool="OWASP ZAP")["total"] == 12
    in_progress = find(client, project_id=workspace["a"], severity="Low", status="In Progress", assignee=str(users["bob"]["id"]), page_size=100)
    assert sorted(i["id"] for i in in_progress["items"]) == sorted(ids)
    assert find(client, project_id=workspace["a"], assignee="unassigned")["total"] == TOTAL - 5
    assert find(client, project_id=workspace["a"], status=["Open", "In Progress"])["total"] == TOTAL


@pytest.mark.parametrize(
    "params",
    [
        {"severity": "Severe"},
        {"status": "Done"},
        {"assignee": "someone"},
        {"date_from": "2026-10-08", "date_to": "2026-10-01"},
        {"sort_by": "password"},
        {"page_size": 1000},
        {"page": 0},
    ],
)
def test_invalid_filters_are_rejected(client, params):
    response = client.get("/api/findings", params=params)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_unclassified_and_critical_high_views(client, make_project):
    project = make_project(name="Severity mix")
    lines = NUCLEI_JSONL.read_text(encoding="utf-8").splitlines()
    mutated = []
    for line, severity in zip(lines[:4], ["critical", "high", "unknown", "low"]):
        record = json.loads(line)
        record["info"]["severity"] = severity  # test-only change to exercise every severity path
        mutated.append(json.dumps(record))
    upload(client, project["id"], name="mix.jsonl", content="\n".join(mutated).encode())

    critical_high = find(client, project_id=project["id"], severity=["Critical", "High"])
    assert critical_high["total"] == 2
    assert [item["normalized_severity"] for item in critical_high["items"]] == ["Critical", "High"]
    unclassified = find(client, project_id=project["id"], severity="Unclassified")
    assert [(i["original_severity"], i["normalized_severity"]) for i in unclassified["items"]] == [("unknown", None)]


def test_facets(client, workspace):
    facets = client.get("/api/findings/facets").json()
    assert facets == {"source_tools": ["Nuclei", "OWASP ZAP"], "categories": []}


# --- details ------------------------------------------------------------------------------

def test_finding_detail_exposes_report_values(client, workspace):
    fid = finding_id(client, workspace["a"], "Cross-Domain Misconfiguration")
    detail = client.get(f"/api/findings/{fid}").json()

    assert detail["original_title"] == detail["normalized_title"] == "Cross-Domain Misconfiguration"
    assert (detail["original_severity"], detail["normalized_severity"]) == ("Medium", "Medium")
    assert detail["cwe"] == "CWE-264"
    assert detail["owasp"] is None and detail["cvss_score"] is None and detail["impact"] is None
    assert detail["recommendation"]
    assert detail["source_reference"]
    assert detail["source_metadata"]["confidence"] == "Medium"
    assert detail["evidence"] == "Access-Control-Allow-Origin: *"
    assert detail["http_method"] == "GET"

    occurrence = detail["occurrences"][0]
    assert occurrence["scan_name"] == "zap-baseline.json"
    assert occurrence["evidence"] == "Access-Control-Allow-Origin: *"

    history = detail["status_history"]
    assert len(history) == 1
    assert history[0]["old_status"] is None and history[0]["new_status"] == "Open" and history[0]["changed_by"] == {"id": client.admin["id"], "name": "Test Admin"}  # the uploader
    assert "Detected in scan" in history[0]["comment"]


def test_detail_lists_potential_duplicates(client, workspace):
    fid = finding_id(client, workspace["a"], "content-security-policy")
    duplicates = client.get(f"/api/findings/{fid}").json()["potential_duplicates"]
    assert [(d["other_title"], d["confidence"], d["decision"]) for d in duplicates] == [
        ("Content Security Policy (CSP) Header Not Set", "Medium", "Pending")
    ]


def test_raw_original_record_is_available(client, workspace):
    fid = finding_id(client, workspace["a"], "Cross-Domain Misconfiguration")
    occurrence_id = client.get(f"/api/findings/{fid}").json()["occurrences"][0]["id"]
    raw = client.get(f"/api/findings/{fid}/occurrences/{occurrence_id}/raw").json()
    assert raw["original_filename"] == "zap-baseline.json"
    assert raw["raw_record"]["alert"]["pluginid"] == "10098"
    assert raw["raw_record"]["instance"]["evidence"] == "Access-Control-Allow-Origin: *"
    assert client.get(f"/api/findings/{fid + 1}/occurrences/{occurrence_id}/raw").status_code == 404


def test_missing_finding_is_404(client):
    assert client.get("/api/findings/999").status_code == 404


# --- single updates -----------------------------------------------------------------------

def test_status_change_requires_a_signed_in_user_with_permission(client, anon_client, login_as, workspace):
    fid = finding_id(client, workspace["a"], "swagger")
    response = anon_client.put(f"/api/findings/{fid}", json={"status": "In Progress"})
    assert (response.status_code, response.json()["error"]["code"]) == (401, "not_authenticated")
    viewer = login_as("Viewer")
    response = viewer.put(f"/api/findings/{fid}", json={"status": "In Progress"})
    assert (response.status_code, response.json()["error"]["code"]) == (403, "forbidden")
    # The old self-declared header grants nothing.
    assert anon_client.put(f"/api/findings/{fid}", json={"status": "In Progress"}, headers={"X-Acting-User": "1"}).status_code == 401
    assert client.get(f"/api/findings/{fid}").json()["status"] == "Open"


def test_status_lifecycle_is_recorded_in_history_and_audit(client, workspace, alice, users, sqlite_rows):
    fid = finding_id(client, workspace["a"], "swagger")
    for status, comment in [("In Progress", "Investigating"), ("Resolved", "Docs endpoint removed"), ("Reopened", "Still reachable in retest")]:
        response = alice.put(f"/api/findings/{fid}", json={"status": status, "comment": comment})
        assert response.status_code == 200, response.text
        assert response.json()["status"] == status

    history = client.get(f"/api/findings/{fid}").json()["status_history"]
    assert [(h["old_status"], h["new_status"]) for h in history] == [
        ("Resolved", "Reopened"),
        ("In Progress", "Resolved"),
        ("Open", "In Progress"),
        (None, "Open"),
    ]
    assert history[0]["changed_by"] == {"id": users["alice"]["id"], "name": "Alice Analyst"}
    assert history[0]["comment"] == "Still reachable in retest"

    assert sqlite_rows("SELECT status FROM findings WHERE id = ?", (fid,)) == [("Reopened",)]
    audit = sqlite_rows("SELECT user_id, details FROM audit_logs WHERE action = 'finding.status_changed' AND entity_id = ? ORDER BY id", (fid,))
    assert len(audit) == 3
    assert all(user_id == users["alice"]["id"] for user_id, _ in audit)
    assert json.loads(audit[-1][1]) == {"from": "Resolved", "to": "Reopened", "comment": "Still reachable in retest"}


def test_setting_the_same_status_records_nothing(client, workspace, alice, sqlite_rows):
    fid = finding_id(client, workspace["a"], "swagger")
    assert alice.put(f"/api/findings/{fid}", json={"status": "Open"}).status_code == 200
    assert sqlite_rows("SELECT COUNT(*) FROM finding_status_history WHERE finding_id = ?", (fid,)) == [(1,)]
    assert sqlite_rows("SELECT COUNT(*) FROM audit_logs WHERE action LIKE 'finding.%'") == [(0,)]


def test_assignment(client, workspace, alice, users, sqlite_rows):
    fid = finding_id(client, workspace["a"], "swagger")
    assigned = alice.put(f"/api/findings/{fid}", json={"assigned_to": users["bob"]["id"]}).json()
    assert assigned["assignee"] == {"id": users["bob"]["id"], "name": "Bob Admin"}
    assert assigned["status"] == "Open"
    assert find(client, assignee=str(users["bob"]["id"]))["total"] == 1

    unassigned = alice.put(f"/api/findings/{fid}", json={"assigned_to": None}).json()
    assert unassigned["assignee"] is None
    rows = sqlite_rows("SELECT details FROM audit_logs WHERE action = 'finding.assigned' ORDER BY id")
    assert [json.loads(r[0]) for r in rows] == [{"from": None, "to": users["bob"]["id"]}, {"from": users["bob"]["id"], "to": None}]

    assert alice.put(f"/api/findings/{fid}", json={"assigned_to": 999}).status_code == 404
    client.put(f"/api/users/{users['bob']['id']}", json={"active": False})
    assert alice.put(f"/api/findings/{fid}", json={"assigned_to": users["bob"]["id"]}).status_code == 400


@pytest.mark.parametrize(
    "body",
    [{}, {"comment": "only a comment"}, {"status": None}, {"status": "Done"}, {"status": "Closed", "normalized_title": "edited"}, {"status": "Closed", "evidence": "x"}],
)
def test_invalid_updates_are_rejected(client, workspace, alice, body):
    fid = finding_id(client, workspace["a"], "swagger")
    response = alice.put(f"/api/findings/{fid}", json=body)
    assert response.status_code == 422
    assert client.get(f"/api/findings/{fid}").json()["status"] == "Open"


def test_changes_persist_across_application_restart(settings, workspace, client, alice):
    fid = finding_id(client, workspace["a"], "swagger")
    alice.put(f"/api/findings/{fid}", json={"status": "Accepted Risk", "comment": "Internal only"})
    with TestClient(create_app(settings)) as fresh:
        fresh.headers.update(CSRF_HEADERS)
        assert fresh.post("/api/auth/login", json={"email": "alice@example.com", "password": TEST_PASSWORD}).status_code == 200
        detail = fresh.get(f"/api/findings/{fid}").json()
    assert detail["status"] == "Accepted Risk"
    assert detail["status_history"][0]["comment"] == "Internal only"


# --- bulk updates -------------------------------------------------------------------------

def test_bulk_status_update(client, workspace, alice, users, sqlite_rows):
    ids = [item["id"] for item in find(client, project_id=workspace["a"], source_tool="Nuclei")["items"]]
    response = alice.post(
        "/api/findings/bulk-update",
        json={"finding_ids": ids + ids[:2], "status": "False Positive", "comment": "Juice Shop is a demo app"},
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert (result["requested"], result["updated"], result["unchanged"]) == (NUCLEI_RESULTS, NUCLEI_RESULTS, 0)
    assert find(client, project_id=workspace["a"], status="False Positive")["total"] == NUCLEI_RESULTS

    marks = ",".join("?" * len(ids))
    assert sqlite_rows(f"SELECT COUNT(*) FROM finding_status_history WHERE new_status = 'False Positive' AND changed_by = ? AND finding_id IN ({marks})", (users["alice"]["id"], *ids)) == [(NUCLEI_RESULTS,)]
    audit = sqlite_rows("SELECT user_id, details FROM audit_logs WHERE action = 'findings.bulk_updated'")
    assert len(audit) == 1
    assert sorted(json.loads(audit[0][1])["finding_ids"]) == sorted(ids)

    again = alice.post("/api/findings/bulk-update", json={"finding_ids": ids, "status": "False Positive"}).json()
    assert (again["updated"], again["unchanged"]) == (0, NUCLEI_RESULTS)
    assert sqlite_rows("SELECT COUNT(*) FROM audit_logs WHERE action = 'findings.bulk_updated'") == [(1,)]


def test_bulk_assignment(client, workspace, alice, users):
    ids = [item["id"] for item in find(client, project_id=workspace["a"], severity="Medium")["items"]]
    result = alice.post("/api/findings/bulk-update", json={"finding_ids": ids, "assigned_to": users["bob"]["id"]}).json()
    assert result["updated"] == 9
    assert find(client, assignee=str(users["bob"]["id"]))["total"] == 9
    assert find(client, project_id=workspace["a"], severity="Medium", status="Open")["total"] == 9


def test_bulk_update_with_unknown_id_changes_nothing(client, workspace, alice, sqlite_rows):
    ids = [item["id"] for item in find(client, project_id=workspace["a"], page_size=5)["items"]]
    response = alice.post("/api/findings/bulk-update", json={"finding_ids": ids + [99999], "status": "Closed"})
    assert response.status_code == 404
    assert response.json()["error"]["details"] == {"missing_ids": [99999]}
    assert sqlite_rows("SELECT COUNT(*) FROM findings WHERE status = 'Closed'") == [(0,)]


def test_bulk_update_is_rolled_back_on_failure(client, workspace, alice, sqlite_rows, monkeypatch):
    def fail(*args, **kwargs):
        raise RuntimeError("simulated failure")

    monkeypatch.setattr("app.services.finding_service.audit_service.record", fail)
    ids = [item["id"] for item in find(client, project_id=workspace["a"], page_size=5)["items"]]
    response = alice.post("/api/findings/bulk-update", json={"finding_ids": ids, "status": "Closed"})
    assert response.status_code == 500
    assert sqlite_rows("SELECT COUNT(*) FROM findings WHERE status = 'Closed'") == [(0,)]
    assert sqlite_rows("SELECT COUNT(*) FROM finding_status_history WHERE new_status = 'Closed'") == [(0,)]


@pytest.mark.parametrize(
    "body, status",
    [
        ({"finding_ids": [], "status": "Closed"}, 422),
        ({"finding_ids": list(range(1, 502)), "status": "Closed"}, 422),
        ({"finding_ids": [1]}, 422),
        ({"finding_ids": [1], "status": "Closed", "title": "x"}, 422),
    ],
)
def test_bulk_update_validation(client, workspace, alice, body, status):
    assert alice.post("/api/findings/bulk-update", json=body).status_code == status


def test_bulk_update_requires_permission(anon_client, login_as, workspace, sqlite_rows):
    body = {"finding_ids": [1], "status": "Closed"}
    assert anon_client.post("/api/findings/bulk-update", json=body).status_code == 401
    assert login_as("Viewer").post("/api/findings/bulk-update", json=body).status_code == 403
    assert sqlite_rows("SELECT COUNT(*) FROM findings WHERE status = 'Closed'") == [(0,)]


# --- audit of other actions ---------------------------------------------------------------

def test_project_and_upload_actions_are_audited_with_the_signed_in_user(client, users, alice, sqlite_rows):
    project = alice.post("/api/projects", json={"name": "Audited"}).json()
    upload(alice, project["id"], ZAP_JSON)
    rows = sqlite_rows("SELECT action, user_id, entity_type FROM audit_logs WHERE action IN ('project.created', 'report.uploaded') ORDER BY id")
    assert rows == [("project.created", users["alice"]["id"], "project"), ("report.uploaded", users["alice"]["id"], "scan")]
    first = find(client, project_id=project["id"], page_size=1)["items"][0]["id"]
    history = client.get(f"/api/findings/{first}").json()["status_history"]
    assert history[0]["changed_by"]["name"] == "Alice Analyst"
