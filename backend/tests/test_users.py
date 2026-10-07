import json
import re
import sqlite3

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.schema import CreateTable

from app.database.migrations import upgrade
from app.main import create_app


def test_create_and_list_users(client, sqlite_rows):
    alice = client.post("/api/users", json={"name": " Alice ", "email": "Alice@Example.com", "role": "Security Analyst"})
    assert alice.status_code == 201
    assert alice.json()["name"] == "Alice"
    assert alice.json()["email"] == "alice@example.com"
    assert alice.json()["active"] is True
    client.post("/api/users", json={"name": "bob", "email": "bob@example.com", "role": "Viewer"})
    assert [user["name"] for user in client.get("/api/users").json()] == ["Alice", "bob"]
    assert sqlite_rows("SELECT action, entity_id FROM audit_logs") == [("user.created", 1), ("user.created", 2)]


def test_duplicate_email_is_rejected(client):
    client.post("/api/users", json={"name": "A", "email": "a@example.com"})
    response = client.post("/api/users", json={"name": "B", "email": "A@EXAMPLE.COM"})
    assert response.status_code == 409


@pytest.mark.parametrize("body", [{"name": "", "email": "a@example.com"}, {"name": "A", "email": "not-an-email"}, {"name": "A", "email": "a@b.co", "role": "Root"}])
def test_invalid_users_are_rejected(client, body):
    assert client.post("/api/users", json=body).status_code == 422


def test_update_and_deactivate_user(client, sqlite_rows):
    user = client.post("/api/users", json={"name": "A", "email": "a@example.com"}).json()
    actor = client.post("/api/users", json={"name": "Admin", "email": "admin@example.com", "role": "Admin"}).json()
    response = client.put(f"/api/users/{user['id']}", json={"role": "Admin", "active": False}, headers={"X-Acting-User": str(actor["id"])})
    assert response.status_code == 200
    assert (response.json()["role"], response.json()["active"]) == ("Admin", False)
    assert [u["id"] for u in client.get("/api/users", params={"include_inactive": False}).json()] == [actor["id"]]
    user_id, details = sqlite_rows("SELECT user_id, details FROM audit_logs WHERE action = 'user.updated'")[0]
    assert user_id == actor["id"]
    assert json.loads(details) == {"role": {"from": "Security Analyst", "to": "Admin"}, "active": {"from": True, "to": False}}
    assert client.put("/api/users/999", json={"active": False}).status_code == 404


def make_phase2_database(settings, free_text_assignee: str | None = None) -> None:
    """Build a database whose findings table matches Phase 2 (assigned_to as free text, no FK)."""
    from app.models import Finding

    with TestClient(create_app(settings)):
        pass
    engine = create_engine(settings.resolved_database_url)
    ddl = str(CreateTable(Finding.__table__).compile(engine))
    ddl = ddl.replace("assigned_to INTEGER", "assigned_to VARCHAR(200)")
    ddl = re.sub(r",\s*FOREIGN KEY\(assigned_to\) REFERENCES users \(id\)", "", ddl)
    assert "REFERENCES users" not in ddl
    with sqlite3.connect(settings.sqlite_path) as conn:
        conn.execute("DROP TABLE finding_occurrences")
        conn.execute("DROP TABLE potential_duplicates")
        conn.execute("DROP TABLE finding_status_history")
        conn.execute("DROP TABLE findings")
        conn.execute(ddl)
        if free_text_assignee:
            conn.execute("INSERT INTO projects (name, status, created_at, updated_at) VALUES ('p', 'Active', '2026-01-01', '2026-01-01')")
            conn.execute(
                "INSERT INTO scans (project_id, scan_name, original_filename, stored_file_path, file_hash, uploaded_at, processing_status, "
                "total_findings, critical_count, high_count, medium_count, low_count, informational_count) "
                "VALUES (1, 's', 'f', 'p', 'h', '2026-01-01', 'Completed', 0, 0, 0, 0, 0, 0)"
            )
            conn.execute(
                "INSERT INTO findings (project_id, scan_id, finding_key, original_title, normalized_title, source_tool, status, "
                "first_detected, last_detected, created_at, updated_at, assigned_to) "
                "VALUES (1, 1, 'k', 't', 't', 'Nuclei', 'Open', '2026-01-01', '2026-01-01', '2026-01-01', '2026-01-01', ?)",
                (free_text_assignee,),
            )


def test_phase2_database_is_upgraded_on_startup(settings):
    make_phase2_database(settings)
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/findings").status_code == 200
    with sqlite3.connect(settings.sqlite_path) as conn:
        column = [row for row in conn.execute("PRAGMA table_info(findings)") if row[1] == "assigned_to"][0]
        assert column[2] == "INTEGER"
        assert [fk for fk in conn.execute("PRAGMA foreign_key_list(findings)") if fk[3] == "assigned_to"][0][2] == "users"
        assert conn.execute("SELECT name FROM sqlite_master WHERE name = 'ix_findings_assigned_to'").fetchone()


def test_upgrade_refuses_to_discard_free_text_assignments(settings):
    make_phase2_database(settings, free_text_assignee="Some Person")
    with pytest.raises(RuntimeError, match="free-text"):
        upgrade(create_engine(settings.resolved_database_url))
    with sqlite3.connect(settings.sqlite_path) as conn:
        assert conn.execute("SELECT assigned_to FROM findings").fetchall() == [("Some Person",)]
