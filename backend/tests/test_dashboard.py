def test_summary_with_empty_database(client):
    response = client.get("/api/dashboard/summary")
    assert response.status_code == 200
    assert response.json() == {
        "project_count": 0,
        "projects_by_status": [],
        "projects_by_environment": [],
        "recent_projects": [],
        "scan_count": 0,
        "failed_scan_count": 0,
        "finding_count": 0,
        "findings_by_severity": {"critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0, "unclassified": 0},
        "recent_scans": [],
    }


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
