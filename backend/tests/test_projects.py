def test_list_projects_empty(client):
    response = client.get("/api/projects")
    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0, "page": 1, "page_size": 20}


def test_create_project_persists_to_sqlite(client, sqlite_rows):
    payload = {
        "name": "  Customer Portal  ",
        "application_name": "Portal Web",
        "description": "Customer-facing portal",
        "environment": "Production",
        "application_url": "https://portal.example.com",
        "owner": "QA Team",
        "status": "Active",
    }
    response = client.post("/api/projects", json=payload)
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Customer Portal"
    assert body["environment"] == "Production"
    assert body["created_at"].endswith("Z") or body["created_at"].endswith("+00:00")

    rows = sqlite_rows("SELECT name, application_name, environment, status, owner FROM projects WHERE id = ?", (body["id"],))
    assert rows == [("Customer Portal", "Portal Web", "Production", "Active", "QA Team")]


def test_create_project_defaults_and_blank_fields(client):
    response = client.post("/api/projects", json={"name": "Minimal", "owner": "   ", "environment": ""})
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "Active"
    assert body["owner"] is None
    assert body["environment"] is None
    assert body["application_url"] is None


def test_create_project_requires_name(client):
    response = client.post("/api/projects", json={"name": "   "})
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert any(detail["field"] == "name" for detail in error["details"])


def test_create_project_rejects_invalid_enum_and_url(client):
    response = client.post(
        "/api/projects",
        json={"name": "Bad", "environment": "Moon", "status": "Done", "application_url": "javascript:alert(1)"},
    )
    assert response.status_code == 422
    fields = {detail["field"] for detail in response.json()["error"]["details"]}
    assert {"environment", "status", "application_url"} <= fields


def test_duplicate_project_name_is_rejected_case_insensitively(client, make_project):
    make_project(name="Customer Portal")
    response = client.post("/api/projects", json={"name": "customer portal"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


def test_get_project(client, make_project):
    project = make_project()
    response = client.get(f"/api/projects/{project['id']}")
    assert response.status_code == 200
    assert response.json() == project


def test_get_missing_project_returns_404(client):
    response = client.get("/api/projects/999")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_update_project_is_partial(client, make_project, sqlite_rows):
    project = make_project(owner="QA Team", environment="Staging")
    response = client.put(f"/api/projects/{project['id']}", json={"status": "On Hold", "owner": "Security Team"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "On Hold"
    assert body["owner"] == "Security Team"
    assert body["environment"] == "Staging"
    assert body["updated_at"] >= project["updated_at"]
    assert sqlite_rows("SELECT status, owner FROM projects WHERE id = ?", (project["id"],)) == [("On Hold", "Security Team")]


def test_update_project_can_clear_optional_field(client, make_project):
    project = make_project(owner="QA Team")
    response = client.put(f"/api/projects/{project['id']}", json={"owner": ""})
    assert response.status_code == 200
    assert response.json()["owner"] is None


def test_update_project_rejects_null_name(client, make_project):
    project = make_project()
    response = client.put(f"/api/projects/{project['id']}", json={"name": None})
    assert response.status_code == 422


def test_update_project_rejects_duplicate_name(client, make_project):
    make_project(name="Alpha")
    beta = make_project(name="Beta")
    response = client.put(f"/api/projects/{beta['id']}", json={"name": "ALPHA"})
    assert response.status_code == 409


def test_update_project_keeps_own_name(client, make_project):
    project = make_project(name="Alpha")
    response = client.put(f"/api/projects/{project['id']}", json={"name": "Alpha", "owner": "x"})
    assert response.status_code == 200


def test_update_missing_project_returns_404(client):
    assert client.put("/api/projects/999", json={"owner": "x"}).status_code == 404


def test_delete_project(client, make_project, sqlite_rows):
    project = make_project()
    response = client.delete(f"/api/projects/{project['id']}")
    assert response.status_code == 204
    assert client.get(f"/api/projects/{project['id']}").status_code == 404
    assert sqlite_rows("SELECT COUNT(*) FROM projects") == [(0,)]


def test_delete_missing_project_returns_404(client):
    assert client.delete("/api/projects/999").status_code == 404


def test_list_projects_pagination(client, make_project):
    for index in range(5):
        make_project(name=f"Project {index}")
    response = client.get("/api/projects", params={"page": 2, "page_size": 2, "sort_by": "name", "sort_order": "asc"})
    body = response.json()
    assert body["total"] == 5
    assert body["page"] == 2
    assert [item["name"] for item in body["items"]] == ["Project 2", "Project 3"]


def test_list_projects_default_sort_is_newest_first(client, make_project):
    make_project(name="First")
    make_project(name="Second")
    names = [item["name"] for item in client.get("/api/projects").json()["items"]]
    assert names == ["Second", "First"]


def test_list_projects_search_and_filters(client, make_project):
    make_project(name="Payments API", owner="Finance QA", environment="Production")
    make_project(name="Internal Wiki", owner="IT", environment="Staging", status="Archived")
    make_project(name="Mobile Backend", description="handles payments", environment="Production")

    search = client.get("/api/projects", params={"search": "payments"}).json()
    assert {item["name"] for item in search["items"]} == {"Payments API", "Mobile Backend"}

    archived = client.get("/api/projects", params={"status": "Archived"}).json()
    assert [item["name"] for item in archived["items"]] == ["Internal Wiki"]

    combined = client.get("/api/projects", params={"environment": "Production", "search": "finance"}).json()
    assert [item["name"] for item in combined["items"]] == ["Payments API"]


def test_list_projects_rejects_invalid_query(client):
    assert client.get("/api/projects", params={"page": 0}).status_code == 422
    assert client.get("/api/projects", params={"page_size": 1000}).status_code == 422
    assert client.get("/api/projects", params={"sort_by": "password"}).status_code == 422
    assert client.get("/api/projects", params={"status": "Unknown"}).status_code == 422
