import sqlite3
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


@pytest.fixture
def client(settings: Settings):
    app = create_app(settings)
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


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
