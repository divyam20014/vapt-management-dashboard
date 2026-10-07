"""Application configuration loaded from environment variables / .env files."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> repository root
REPO_ROOT = Path(__file__).resolve().parents[3]

SQLITE_PREFIX = "sqlite:///"


def resolve_path(value: str | Path) -> Path:
    """Resolve a configured path; relative paths are anchored at the repository root."""
    path = Path(value)
    if not path.is_absolute():
        path = REPO_ROOT / path
    return path.resolve()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", REPO_ROOT / "backend" / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "VAPT Management Dashboard"
    database_url: str = "sqlite:///./data/vapt.db"
    upload_directory: str = "./data/uploads"
    export_directory: str = "./exports"
    max_upload_size_mb: int = 50
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    log_level: str = "INFO"
    frontend_dist: str = "./frontend/dist"
    # Sign-in sessions: ended after this much inactivity, and in any case after the maximum age.
    session_idle_minutes: int = 480
    session_max_hours: int = 24
    # Set to true when the application is served over HTTPS so the session cookie is never sent in clear text.
    session_cookie_secure: bool = False
    # SQLite write-ahead logging lets pages keep reading while a large upload is being saved. Turn it
    # off where the database sits on a file system without shared-memory support (network shares,
    # Docker Desktop bind mounts). Writers always wait up to `sqlite_busy_timeout_seconds` for a lock.
    sqlite_wal: bool = True
    sqlite_busy_timeout_seconds: int = 30

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def sqlite_path(self) -> Path | None:
        """Filesystem path of the SQLite database, or None for in-memory/non-SQLite URLs."""
        if not self.database_url.startswith(SQLITE_PREFIX):
            return None
        raw = self.database_url[len(SQLITE_PREFIX):]
        if raw in ("", ":memory:"):
            return None
        return resolve_path(raw)

    @property
    def resolved_database_url(self) -> str:
        path = self.sqlite_path
        if path is None:
            return self.database_url
        return f"{SQLITE_PREFIX}{path.as_posix()}"

    @property
    def upload_path(self) -> Path:
        return resolve_path(self.upload_directory)

    @property
    def export_path(self) -> Path:
        return resolve_path(self.export_directory)

    @property
    def frontend_dist_path(self) -> Path:
        return resolve_path(self.frontend_dist)


@lru_cache
def get_settings() -> Settings:
    return Settings()
