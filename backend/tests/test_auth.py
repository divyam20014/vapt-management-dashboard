"""Phase 6: authentication, role-based authorization (enforced server-side) and the audit trail."""

import hashlib
import json
import logging
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from app.core.permissions import ROLE_PERMISSIONS, Permission
from app.main import create_app
from app.models import UserRole
from tests.conftest import ADMIN, CSRF_HEADERS, TEST_PASSWORD, admin_session, new_client
from tests.fixtures import NUCLEI_JSONL, ZAP_JSON

COOKIE = "vapt_session"


def upload(client, project_id, path, **data):
    return client.post(
        "/api/scans/upload",
        data={"project_id": str(project_id), **data},
        files={"file": (path.name, path.read_bytes(), "application/octet-stream")},
    )


def login(client, email, password=TEST_PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


@pytest.fixture
def project(client):
    response = client.post("/api/projects", json={"name": "Juice Shop"})
    assert response.status_code == 201
    return response.json()


@pytest.fixture
def loaded(client, project):
    assert upload(client, project["id"], ZAP_JSON).status_code == 201
    assert upload(client, project["id"], NUCLEI_JSONL).status_code == 201
    return project


def first_finding(client, project_id):
    return client.get("/api/findings", params={"project_id": project_id, "page_size": 1}).json()["items"][0]["id"]


# --- First-run setup --------------------------------------------------------------------------

def test_first_run_setup_creates_one_admin_and_signs_in(anon_client, sqlite_rows):
    assert anon_client.get("/api/auth/status").json() == {"setup_required": True, "user": None}
    response = anon_client.post("/api/auth/setup", json=ADMIN)
    assert response.status_code == 201, response.text
    me = response.json()
    assert (me["role"], me["email"]) == ("Admin", ADMIN["email"])
    assert set(me["permissions"]) == {p.value for p in Permission}

    cookie = response.headers["set-cookie"]
    for flag in ("HttpOnly", "SameSite=strict", "Path=/api"):
        assert flag.lower() in cookie.lower(), flag
    assert anon_client.get("/api/auth/me").json()["id"] == me["id"]

    status = anon_client.get("/api/auth/status").json()
    assert status["setup_required"] is False and status["user"]["id"] == me["id"]  # this browser is signed in
    again = anon_client.post("/api/auth/setup", json={**ADMIN, "email": "second@example.test"})
    assert (again.status_code, again.json()["error"]["code"]) == (409, "setup_complete")
    assert sqlite_rows("SELECT COUNT(*) FROM users") == [(1,)]
    assert sqlite_rows("SELECT action, user_id FROM audit_logs") == [("auth.setup_completed", me["id"])]


def test_setup_enforces_the_password_length(anon_client):
    response = anon_client.post("/api/auth/setup", json={**ADMIN, "password": "short"})
    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"] == "password"
    assert anon_client.get("/api/auth/status").json()["setup_required"] is True


def test_setup_claims_a_user_created_before_sign_in_existed(app, sqlite_rows):
    """Users from earlier phases have no password. Setup with the same email keeps that user's id (and history)."""
    with new_client(app) as c:
        with sqlite3.connect(app.state.settings.sqlite_path) as conn:
            conn.execute("INSERT INTO users (name, email, role, active, created_at) VALUES ('Old', 'admin@example.test', 'Viewer', 1, '2026-01-01')")
        assert c.get("/api/auth/status").json()["setup_required"] is True
        me = c.post("/api/auth/setup", json=ADMIN).json()
    assert me["id"] == 1 and me["role"] == "Admin"


# --- Sign-in ----------------------------------------------------------------------------------

def test_login_success_and_generic_failures(client, anon_client, sqlite_rows):
    client.post("/api/users", json={"name": "Nopass", "email": "nopass@example.test", "role": "Viewer"})
    inactive = client.post("/api/users", json={"name": "Gone", "email": "gone@example.test", "role": "Viewer", "password": TEST_PASSWORD}).json()
    client.put(f"/api/users/{inactive['id']}", json={"active": False})

    for email, password in [
        (ADMIN["email"], "wrong-password-123"),       # wrong password
        ("nobody@example.test", TEST_PASSWORD),       # unknown account
        ("nopass@example.test", TEST_PASSWORD),       # no password set yet
        ("gone@example.test", TEST_PASSWORD),         # deactivated
    ]:
        response = login(anon_client, email, password)
        assert response.status_code == 401
        assert response.json()["error"] == {"code": "invalid_credentials", "message": "Email or password is incorrect."}
        assert COOKIE not in response.cookies

    response = login(anon_client, ADMIN["email"].upper(), ADMIN["password"])  # email is case-insensitive
    assert response.status_code == 200 and response.json()["last_login_at"]
    assert anon_client.get("/api/auth/me").status_code == 200
    assert sqlite_rows("SELECT COUNT(*) FROM audit_logs WHERE action = 'auth.login_failed'") == [(4,)]
    assert sqlite_rows("SELECT COUNT(*) FROM audit_logs WHERE action = 'auth.login'") == [(1,)]


def test_repeated_failures_are_throttled(client, anon_client):
    for _ in range(5):
        assert login(anon_client, ADMIN["email"], "wrong-password-123").status_code == 401
    response = login(anon_client, ADMIN["email"], ADMIN["password"])  # even the right password is refused for now
    assert (response.status_code, response.json()["error"]["code"]) == (429, "too_many_attempts")


def test_logout_ends_the_session(client):
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/status").json() == {"setup_required": False, "user": None}
    response = client.get("/api/findings")
    assert (response.status_code, response.json()["error"]["code"]) == (401, "not_authenticated")


@pytest.mark.parametrize("column", ["last_seen_at", "expires_at"])
def test_idle_and_expired_sessions_are_refused(client, settings, column):
    past = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S.%f")
    with sqlite3.connect(settings.sqlite_path) as conn:
        conn.execute(f"UPDATE user_sessions SET {column} = ?", (past,))
    assert client.get("/api/projects").status_code == 401
    with sqlite3.connect(settings.sqlite_path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM user_sessions").fetchone() == (0,)


def test_forged_or_tampered_cookies_are_refused(anon_client):
    for value in ("", "x", "a" * 43, "../../etc/passwd"):
        anon_client.cookies.set(COOKIE, value, path="/api")
        assert anon_client.get("/api/auth/me").status_code == 401


# --- Secrets are never stored or logged in clear --------------------------------------------

def test_passwords_and_tokens_are_stored_hashed_and_never_logged(app, settings, caplog):
    caplog.set_level(logging.DEBUG)
    with new_client(app) as c:
        c.post("/api/auth/setup", json=ADMIN)
        token = c.cookies.get(COOKIE)
        c.post("/api/auth/change-password", json={"current_password": ADMIN["password"], "new_password": "brand-new-password-456"})
        login(c, ADMIN["email"], "wrong-password-999")

    with sqlite3.connect(settings.sqlite_path) as conn:
        stored_hash = conn.execute("SELECT password_hash FROM users").fetchone()[0]
        stored_token = conn.execute("SELECT token_hash FROM user_sessions").fetchone()[0]
        audit = json.dumps(conn.execute("SELECT details FROM audit_logs").fetchall())
    assert stored_hash.startswith("scrypt$") and "brand-new-password-456" not in stored_hash
    assert stored_token == hashlib.sha256(token.encode()).hexdigest() != token

    database = settings.sqlite_path.read_bytes()
    logs = caplog.text
    for secret in (ADMIN["password"], "brand-new-password-456", "wrong-password-999", token):
        assert secret.encode() not in database
        assert secret not in logs
        assert secret not in audit


# --- CSRF -------------------------------------------------------------------------------------

def test_state_changing_requests_need_the_csrf_header(client):
    del client.headers["X-Requested-With"]
    response = client.post("/api/projects", json={"name": "Forged"})
    assert (response.status_code, response.json()["error"]["code"]) == (403, "csrf_check_failed")
    assert client.post("/api/auth/login", json={"email": ADMIN["email"], "password": ADMIN["password"]}).status_code == 403
    assert client.get("/api/projects").status_code == 200  # reads are unaffected
    client.headers.update(CSRF_HEADERS)
    assert client.get("/api/projects").json()["total"] == 0


# --- Every protected route refuses anonymous callers ---------------------------------------

PUBLIC = {("GET", "/api/health"), ("GET", "/api/auth/status"), ("POST", "/api/auth/setup"), ("POST", "/api/auth/login")}


def test_every_api_route_requires_sign_in_except_the_public_ones(app, anon_client):
    routes = [(method.upper(), path) for path, ops in app.openapi()["paths"].items() for method in ops]
    assert len(routes) > 35 and PUBLIC <= set(routes)
    for method, path in routes:
        if (method, path) in PUBLIC:
            continue
        concrete = path.replace("{name}", "x.csv")
        for param in ("project_id", "scan_id", "finding_id", "occurrence_id", "pair_id", "user_id"):
            concrete = concrete.replace("{" + param + "}", "1")
        response = anon_client.request(method, concrete, json={})
        assert response.status_code == 401, (method, path, response.status_code)


# --- Role matrix ------------------------------------------------------------------------------

def test_role_permission_map():
    assert ROLE_PERMISSIONS[UserRole.VIEWER] == {Permission.READ, Permission.EXPORT}
    analyst = ROLE_PERMISSIONS[UserRole.SECURITY_ANALYST]
    assert {Permission.PROJECTS_WRITE, Permission.REPORTS_UPLOAD, Permission.FINDINGS_UPDATE, Permission.DUPLICATES_DECIDE} <= analyst
    assert not analyst & {Permission.PROJECTS_DELETE, Permission.USERS_MANAGE, Permission.AUDIT_READ}
    assert ROLE_PERMISSIONS[UserRole.ADMIN] == set(Permission)


def test_viewer_can_read_and_export_but_not_change_anything(client, login_as, loaded, sqlite_rows):
    viewer = login_as("Viewer")
    fid = first_finding(client, loaded["id"])
    scans = client.get("/api/scans").json()["items"]
    for path in ["/api/projects", f"/api/projects/{loaded['id']}", "/api/findings", f"/api/findings/{fid}", "/api/scans",
                 f"/api/scans/{scans[0]['id']}", f"/api/scans/{scans[0]['id']}/original", "/api/dashboard/summary", "/api/users",
                 "/api/settings", f"/api/scans/compare?base_scan_id={scans[1]['id']}&compare_scan_id={scans[0]['id']}",
                 "/api/exports/findings?format=csv", f"/api/exports/projects/{loaded['id']}/report", "/api/exports"]:
        assert viewer.get(path).status_code == 200, path

    before = sqlite_rows("SELECT COUNT(*) FROM projects"), sqlite_rows("SELECT status, assigned_to FROM findings ORDER BY id")
    pair = client.get(f"/api/findings/{fid}").json()
    denied = [
        viewer.post("/api/projects", json={"name": "X"}),
        viewer.put(f"/api/projects/{loaded['id']}", json={"name": "X"}),
        viewer.delete(f"/api/projects/{loaded['id']}"),
        upload(viewer, loaded["id"], ZAP_JSON, allow_duplicate="true"),
        viewer.post("/api/scans/upload-bulk", data={"project_id": str(loaded["id"])}, files=[("files", ("a.json", b"{}", "application/json"))]),
        viewer.put(f"/api/findings/{fid}", json={"status": "Closed"}),
        viewer.post("/api/findings/bulk-update", json={"finding_ids": [fid], "status": "Closed"}),
        viewer.put(f"/api/findings/{fid}/duplicates/1", json={"decision": "Kept Separate"}),
        viewer.post("/api/users", json={"name": "X", "email": "x@example.test"}),
        viewer.put(f"/api/users/{client.admin['id']}", json={"role": "Viewer"}),
        viewer.put(f"/api/users/{client.admin['id']}/password", json={"password": "takeover-password-1"}),
        viewer.get("/api/audit-logs"),
    ]
    for response in denied:
        assert (response.status_code, response.json()["error"]["code"]) == (403, "forbidden"), response.request.url
    assert (sqlite_rows("SELECT COUNT(*) FROM projects"), sqlite_rows("SELECT status, assigned_to FROM findings ORDER BY id")) == before
    assert pair == client.get(f"/api/findings/{fid}").json()


def test_security_analyst_has_operational_access_only(client, login_as, loaded):
    analyst = login_as("Security Analyst")
    fid = first_finding(client, loaded["id"])
    created = analyst.post("/api/projects", json={"name": "Analyst project"})
    assert created.status_code == 201
    assert analyst.put(f"/api/projects/{created.json()['id']}", json={"owner": "QA"}).status_code == 200
    assert upload(analyst, created.json()["id"], ZAP_JSON).status_code == 201
    assert analyst.put(f"/api/findings/{fid}", json={"status": "In Progress"}).status_code == 200
    assert analyst.post("/api/findings/bulk-update", json={"finding_ids": [fid], "status": "Resolved"}).status_code == 200

    empty = analyst.post("/api/projects", json={"name": "Empty"}).json()
    for response in [
        analyst.delete(f"/api/projects/{empty['id']}"),
        analyst.post("/api/users", json={"name": "X", "email": "x@example.test"}),
        analyst.put(f"/api/users/{analyst.user['id']}", json={"role": "Admin"}),  # no self-promotion
        analyst.put(f"/api/users/{client.admin['id']}/password", json={"password": "takeover-password-1"}),
        analyst.get("/api/audit-logs"),
    ]:
        assert response.status_code == 403
    assert client.get(f"/api/projects/{empty['id']}").status_code == 200
    assert client.get("/api/auth/me").json()["role"] == "Admin"


def test_admin_only_actions(client, login_as):
    empty = client.post("/api/projects", json={"name": "Empty"}).json()
    assert client.delete(f"/api/projects/{empty['id']}").status_code == 204
    user = client.post("/api/users", json={"name": "New", "email": "new@example.test", "role": "Viewer"}).json()
    assert client.put(f"/api/users/{user['id']}", json={"role": "Security Analyst"}).status_code == 200
    assert client.put(f"/api/users/{user['id']}/password", json={"password": TEST_PASSWORD}).json()["can_sign_in"] is True
    assert client.get("/api/audit-logs").status_code == 200


def test_role_changes_and_deactivation_apply_to_existing_sessions(client, login_as, project):
    analyst = login_as("Security Analyst")
    assert analyst.post("/api/projects", json={"name": "Before"}).status_code == 201
    client.put(f"/api/users/{analyst.user['id']}", json={"role": "Viewer"})
    assert analyst.post("/api/projects", json={"name": "After"}).status_code == 403
    assert analyst.get("/api/auth/me").json()["permissions"] == ["export", "read"]
    client.put(f"/api/users/{analyst.user['id']}", json={"active": False})
    assert analyst.get("/api/projects").status_code == 401


def test_admin_password_reset_signs_the_user_out(client, login_as, app):
    analyst = login_as("Security Analyst")
    assert client.put(f"/api/users/{analyst.user['id']}/password", json={"password": "reset-by-admin-123"}).status_code == 200
    assert analyst.get("/api/projects").status_code == 401
    with new_client(app) as c:
        assert login(c, analyst.user["email"]).status_code == 401
        assert login(c, analyst.user["email"], "reset-by-admin-123").status_code == 200
    short = client.put(f"/api/users/{analyst.user['id']}/password", json={"password": "short"})
    assert short.status_code == 422


def test_change_own_password(client, app):
    with admin_session(app) as other_browser:
        response = client.post("/api/auth/change-password", json={"current_password": "not-it-at-all", "new_password": "new-password-789"})
        assert (response.status_code, response.json()["error"]["details"][0]["field"]) == (422, "current_password")
        assert client.post("/api/auth/change-password", json={"current_password": ADMIN["password"], "new_password": "new-password-789"}).status_code == 204
        assert client.get("/api/auth/me").status_code == 200          # this browser stays signed in
        assert other_browser.get("/api/auth/me").status_code == 401   # other sessions are ended
    with new_client(app) as c:
        assert login(c, ADMIN["email"], ADMIN["password"]).status_code == 401
        assert login(c, ADMIN["email"], "new-password-789").status_code == 200


def test_the_last_admin_cannot_be_locked_out(client, login_as):
    me = client.admin["id"]
    for body in ({"active": False}, {"role": "Viewer"}):
        response = client.put(f"/api/users/{me}", json=body)
        assert response.status_code == 409, body
    second = login_as("Admin", name="Second Admin")
    # With two Admins, one may demote the other, but never below one Admin who can sign in.
    assert second.put(f"/api/users/{me}", json={"role": "Security Analyst"}).status_code == 200
    assert client.get("/api/auth/me").json()["role"] == "Security Analyst"
    assert client.put(f"/api/users/{second.user['id']}", json={"role": "Viewer"}).status_code == 403


# --- Audit trail ------------------------------------------------------------------------------

def test_audited_actions_record_user_project_and_finding(client, login_as, project, sqlite_rows):
    analyst = login_as("Security Analyst", name="Alice")
    alice = analyst.user["id"]
    assert upload(analyst, project["id"], ZAP_JSON).status_code == 201
    assert upload(analyst, project["id"], ZAP_JSON).status_code == 409                    # warned …
    assert upload(analyst, project["id"], ZAP_JSON, allow_duplicate="true").status_code == 201   # … and chose to continue
    nuclei = upload(analyst, project["id"], NUCLEI_JSONL).json()
    pair = nuclei["potential_duplicates"][0]
    fid = pair["finding_id"]
    detail = analyst.put(f"/api/findings/{fid}", json={"status": "In Progress", "assigned_to": alice, "comment": "Fixing"}).json()
    pair_id = detail["potential_duplicates"][0]["id"]
    kept = analyst.put(f"/api/findings/{fid}/duplicates/{pair_id}", json={"decision": "Kept Separate", "comment": "Different checks"})
    assert kept.status_code == 200 and kept.json()["potential_duplicates"][0]["decision"] == "Kept Separate"
    assert analyst.put(f"/api/findings/{fid}/duplicates/{pair_id}", json={"decision": "Merged"}).status_code == 422
    analyst.post("/api/findings/bulk-update", json={"finding_ids": [fid], "status": "Resolved"})
    scans = client.get("/api/scans", params={"project_id": project["id"], "status": "Completed"}).json()["items"]
    analyst.get("/api/scans/compare", params={"base_scan_id": scans[-1]["id"], "compare_scan_id": scans[0]["id"]})
    analyst.get("/api/exports/findings", params={"format": "csv", "project_id": project["id"]})
    empty = client.post("/api/projects", json={"name": "Temporary"}).json()
    client.delete(f"/api/projects/{empty['id']}")

    rows = sqlite_rows("SELECT action, user_id, project_id, finding_id FROM audit_logs WHERE user_id = ? ORDER BY id", (alice,))
    assert [r[0] for r in rows] == [
        "auth.login", "report.uploaded", "report.uploaded", "report.duplicate_accepted", "report.uploaded",
        "finding.status_changed", "finding.assigned", "duplicate.decided", "findings.bulk_updated",
        "scans.compared", "report.exported",
    ]
    assert all(r[2] == project["id"] for r in rows[1:])
    assert {r[3] for r in rows if r[0] in ("finding.status_changed", "finding.assigned", "duplicate.decided", "findings.bulk_updated")} == {fid}
    deleted = sqlite_rows("SELECT user_id, project_id, details FROM audit_logs WHERE action = 'project.deleted'")
    assert deleted[0][:2] == (client.admin["id"], empty["id"]) and json.loads(deleted[0][2]) == {"name": "Temporary"}

    # The Audit Log API resolves names and filters on the server.
    page = client.get("/api/audit-logs", params={"user_id": alice, "page_size": 200}).json()
    assert page["total"] == len(rows)
    newest = page["items"][0]
    assert (newest["action"], newest["action_label"], newest["user"]["name"], newest["project"]["name"]) == (
        "report.exported", "Export", "Alice", "Juice Shop"
    )
    by_finding = client.get("/api/audit-logs", params={"finding_id": fid}).json()["items"]
    assert {e["finding"]["title"] for e in by_finding} == {detail["normalized_title"]}
    by_action = client.get("/api/audit-logs", params=[("action", "duplicate.decided"), ("action", "report.duplicate_accepted")]).json()
    assert by_action["total"] == 2
    gone = client.get("/api/audit-logs", params={"project_id": empty["id"]}).json()["items"]
    assert [e["action"] for e in gone] == ["project.deleted", "project.created"] and gone[0]["project"]["name"] is None
    actions = {a["code"] for a in client.get("/api/audit-logs/actions").json()}
    assert {"duplicate.decided", "auth.login_failed", "report.exported"} <= actions
    assert client.get("/api/audit-logs", params={"date_from": "2026-02-02", "date_to": "2026-02-01"}).status_code == 400


def test_old_audit_rows_are_backfilled_from_stored_references(app, settings):
    with admin_session(app) as c:
        project_id = c.post("/api/projects", json={"name": "Before upgrade"}).json()["id"]
        assert upload(c, project_id, NUCLEI_JSONL).status_code == 201
        fid = first_finding(c, project_id)
        c.put(f"/api/findings/{fid}", json={"status": "Closed"})
    with sqlite3.connect(settings.sqlite_path) as conn:
        for index in ("ix_audit_logs_project_id", "ix_audit_logs_finding_id"):
            conn.execute(f"DROP INDEX {index}")
        conn.execute("ALTER TABLE audit_logs DROP COLUMN project_id")
        conn.execute("ALTER TABLE audit_logs DROP COLUMN finding_id")
    with admin_session(create_app(settings)):
        pass
    with sqlite3.connect(settings.sqlite_path) as conn:
        rows = dict(conn.execute("SELECT action, project_id FROM audit_logs WHERE action IN ('project.created', 'report.uploaded', 'finding.status_changed')").fetchall())
        assert rows == {"project.created": project_id, "report.uploaded": project_id, "finding.status_changed": project_id}
        assert conn.execute("SELECT finding_id FROM audit_logs WHERE action = 'finding.status_changed'").fetchone() == (fid,)
        assert conn.execute("SELECT project_id FROM audit_logs WHERE action = 'auth.setup_completed'").fetchone() == (None,)


# --- Local recovery ---------------------------------------------------------------------------

def test_command_line_password_reset_recovers_a_locked_out_admin(app, settings, monkeypatch, sqlite_rows):
    from app import cli

    monkeypatch.setattr(cli, "get_settings", lambda: settings)
    with admin_session(app) as c:
        c.put(f"/api/users/{c.admin['id']}", json={"name": "Renamed"})
    assert "Password set for Renamed (Admin)" in cli.reset_password(ADMIN["email"].upper(), "recovered-passphrase-1")
    with pytest.raises(SystemExit, match="at least 12"):
        cli.reset_password(ADMIN["email"], "short")
    with pytest.raises(SystemExit, match="No user"):
        cli.reset_password("nobody@example.test", "recovered-passphrase-1")
    with new_client(app) as c:
        assert login(c, ADMIN["email"], ADMIN["password"]).status_code == 401
        assert login(c, ADMIN["email"], "recovered-passphrase-1").status_code == 200
    assert sqlite_rows("SELECT user_id, details FROM audit_logs WHERE action = 'user.password_set'")[-1][0] is None
