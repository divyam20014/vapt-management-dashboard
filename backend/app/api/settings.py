from pathlib import Path

from fastapi import APIRouter, Request

from app import __version__
from app.core.config import REPO_ROOT, Settings
from app.schemas.settings import AppSettingsRead
from app.services.upload_validation import ALLOWED_EXTENSIONS

router = APIRouter(prefix="/settings", tags=["settings"])


def _display_location(path: Path | None) -> str:
    """Show storage locations relative to the application root; never expose other absolute paths."""
    if path is None:
        return "In-memory"
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return "Custom location (outside application directory)"


@router.get("", response_model=AppSettingsRead)
def get_app_settings(request: Request):
    settings: Settings = request.app.state.settings
    return AppSettingsRead(
        app_name=settings.app_name,
        version=__version__,
        database_engine="SQLite" if settings.database_url.startswith("sqlite") else "Other",
        database_location=_display_location(settings.sqlite_path),
        upload_location=_display_location(settings.upload_path),
        export_location=_display_location(settings.export_path),
        max_upload_size_mb=settings.max_upload_size_mb,
        allowed_extensions=list(ALLOWED_EXTENSIONS),
    )
