import sqlite3
from contextlib import contextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        database_url=f"sqlite:///{(tmp_path / 'data' / 'vapt.db').as_posix()}",
        upload_directory=str(tmp_path / "data" / "uploads"),
        export_directory=str(tmp_path / "exports"),
        frontend_dist=str(tmp_path / "no-frontend"),
    )


CSRF_HEADERS = {"X-Requested-With": "XMLHttpRequest"}
ADMIN = {"name": "Test Admin", "email": "admin@example.test", "password": "admin-password-123"}
TEST_PASSWORD = "correct-horse-battery"


@pytest.fixture(autouse=True)
def fast_password_hashing(monkeypatch):
    """Production scrypt cost is deliberately slow; tests use a cheap cost (the stored hash records it)."""
    from app.core import security

    monkeypatch.setattr(security, "SCRYPT_N", 2**10)


@pytest.fixture
def app(settings: Settings):
    return create_app(settings)


def new_client(app) -> TestClient:
    test_client = TestClient(app, raise_server_exceptions=False)
    test_client.headers.update(CSRF_HEADERS)
    return test_client


@contextmanager
def admin_session(app):
    """A client for a fresh app instance, signed in as the test Admin (set up on first use)."""
    with new_client(app) as test_client:
        if test_client.get("/api/auth/status").json()["setup_required"]:
            response = test_client.post("/api/auth/setup", json=ADMIN)
        else:
            response = test_client.post("/api/auth/login", json={"email": ADMIN["email"], "password": ADMIN["password"]})
        assert response.status_code in (200, 201), response.text
        test_client.admin = response.json()
        yield test_client


@pytest.fixture
def anon_client(app):
    """Not signed in (but sends the CSRF header, so 401/403 come from authentication/authorization)."""
    with new_client(app) as test_client:
        yield test_client


@pytest.fixture
def client(app, anon_client):
    """Signed in as the first Admin, created through the first-run setup."""
    with new_client(app) as test_client:
        response = test_client.post("/api/auth/setup", json=ADMIN)
        assert response.status_code == 201, response.text
        test_client.admin = response.json()
        yield test_client


@pytest.fixture
def login_as(app, client):
    """Create (or reuse) a user with a password and return a client signed in as that user."""
    clients = []

    def sign_in(role: str = "Security Analyst", name: str | None = None, email: str | None = None) -> TestClient:
        name = name or role
        email = email or f"{name.lower().replace(' ', '.')}@example.test"
        existing = next((u for u in client.get("/api/users").json() if u["email"] == email), None)
        if existing is None:
            created = client.post("/api/users", json={"name": name, "email": email, "role": role, "password": TEST_PASSWORD})
            assert created.status_code == 201, created.text
            user = created.json()
        else:
            user = existing
            assert client.put(f"/api/users/{user['id']}/password", json={"password": TEST_PASSWORD}).status_code == 200
        test_client = new_client(app).__enter__()
        clients.append(test_client)
        response = test_client.post("/api/auth/login", json={"email": email, "password": TEST_PASSWORD})
        assert response.status_code == 200, response.text
        test_client.user = response.json()
        return test_client

    yield sign_in
    for test_client in clients:
        test_client.__exit__(None, None, None)


@pytest.fixture
def sqlite_rows(settings: Settings):
    """Run a raw SQL query directly against the SQLite file (bypassing the ORM)."""

    def query(sql: str, params: tuple = ()) -> list[tuple]:
        with sqlite3.connect(settings.sqlite_path) as conn:
            return conn.execute(sql, params).fetchall()

    return query


@pytest.fixture
def make_project(client: TestClient):
    def create(**overrides) -> dict:
        payload = {"name": "Customer Portal", **overrides}
        response = client.post("/api/projects", json=payload)
        assert response.status_code == 201, response.text
        return response.json()

    return create
