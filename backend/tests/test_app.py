from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def test_startup_creates_database_and_storage_directories(settings: Settings, sqlite_rows):
    assert not settings.sqlite_path.exists()
    with TestClient(create_app(settings)):
        pass
    assert settings.sqlite_path.is_file()
    assert settings.upload_path.is_dir()
    assert settings.export_path.is_dir()
    tables = {row[0] for row in sqlite_rows("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "projects" in tables


def test_project_indexes_exist(client, sqlite_rows):
    indexes = {row[0] for row in sqlite_rows("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='projects'")}
    assert {"ix_projects_status", "ix_projects_created_at"} <= indexes


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["database"] == "ok"


def test_unknown_api_route_uses_error_envelope(client):
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.json() == {"error": {"code": "not_found", "message": "The requested resource was not found."}}


def test_unhandled_error_hides_internals(settings: Settings):
    app = create_app(settings)

    @app.get("/api/boom")
    def boom():
        raise RuntimeError(r"secret failure in C:\internal\path")

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/api/boom")
    assert response.status_code == 500
    body = response.json()
    assert body["error"]["code"] == "internal_error"
    assert "secret failure" not in response.text
    assert "internal\\\\path" not in response.text and "Traceback" not in response.text


def test_cors_allows_configured_origin(client):
    response = client.options(
        "/api/projects",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_rejects_unknown_origin(client):
    response = client.options(
        "/api/projects",
        headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in response.headers


def test_settings_endpoint_does_not_expose_absolute_paths(client, settings: Settings):
    response = client.get("/api/settings")
    assert response.status_code == 200
    body = response.json()
    assert body["max_upload_size_mb"] == 50
    assert body["database_engine"] == "SQLite"
    assert str(settings.sqlite_path.parent) not in response.text


def test_relative_paths_resolve_against_repository_root():
    from app.core.config import REPO_ROOT

    settings = Settings(_env_file=None, database_url="sqlite:///./data/vapt.db", upload_directory="./data/uploads")
    assert settings.sqlite_path == (REPO_ROOT / "data" / "vapt.db").resolve()
    assert settings.upload_path == (REPO_ROOT / "data" / "uploads").resolve()
