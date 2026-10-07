def test_summary_with_empty_database(client):
    response = client.get("/api/dashboard/summary")
    assert response.status_code == 200
    body = response.json()
    zero = {"critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0, "unclassified": 0}
    assert body["project_id"] is None
    assert (body["project_count"], body["scan_count"], body["failed_scan_count"], body["finding_count"]) == (0, 0, 0, 0)
    assert body["findings_by_severity"] == zero and body["active_by_severity"] == zero
    assert all(row["count"] == 0 for row in body["status_summary"]) and len(body["status_summary"]) == 7
    assert body["indicators"] == {
        "active_findings": 0,
        "active_critical_high": 0,
        "unassigned_active": 0,
        "resolved_last_30_days": 0,
        "oldest_active_critical_high": None,
    }
    for key in ("findings_by_project", "top_categories", "top_cwes", "recent_scans", "recent_critical_high", "recent_projects"):
        assert body[key] == [], key
    assert body["latest_scan"] is None
    assert client.get("/api/dashboard/trends").json() == {"granularity": "day", "points": []}


def test_summary_matches_direct_sqlite_queries(client, make_project, sqlite_rows):
    make_project(name="A", environment="Production")
    make_project(name="B", environment="Production", status="On Hold")
    make_project(name="C", environment="Staging")
    make_project(name="D")

    summary = client.get("/api/dashboard/summary").json()

    assert summary["project_count"] == sqlite_rows("SELECT COUNT(*) FROM projects")[0][0] == 4

    status_counts = dict(sqlite_rows("SELECT status, COUNT(*) FROM projects GROUP BY status"))
    assert {row["label"]: row["count"] for row in summary["projects_by_status"]} == status_counts

    env_counts = {(env or "Not Set"): count for env, count in sqlite_rows("SELECT environment, COUNT(*) FROM projects GROUP BY environment")}
    assert {row["label"]: row["count"] for row in summary["projects_by_environment"]} == env_counts


def test_summary_recent_projects_are_newest_first_and_limited(client, make_project):
    for index in range(7):
        make_project(name=f"P{index}")
    recent = client.get("/api/dashboard/summary").json()["recent_projects"]
    assert [project["name"] for project in recent] == ["P6", "P5", "P4", "P3", "P2"]


def test_summary_reflects_deletes(client, make_project):
    project = make_project()
    assert client.get("/api/dashboard/summary").json()["project_count"] == 1
    client.delete(f"/api/projects/{project['id']}")
    assert client.get("/api/dashboard/summary").json()["project_count"] == 0
