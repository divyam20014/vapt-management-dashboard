"""FastAPI application entry point: `uvicorn app.main:app` from the backend directory."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app import __version__
from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.errors import error_response, register_exception_handlers
from app.core.upload_guard import UploadGuard
from app.core.logging import configure_logging
from app.database import create_session_factory, init_db
from app.database.session import create_db_engine
from app.services.auth_service import LoginThrottle

logger = logging.getLogger(__name__)


def _mount_frontend(app: FastAPI, dist: Path) -> None:
    """Serve the built SPA (used by the Docker image). Unknown non-API paths fall back to index.html."""
    index_file = dist / "index.html"
    if not index_file.is_file():
        return

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            return error_response(404, "not_found", "The requested resource was not found.")
        candidate = (dist / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(dist):
            return FileResponse(candidate)
        return FileResponse(index_file)

    logger.info("Serving built frontend from %s", dist.name)


# Browsers cannot add this header to a cross-site form post or a simple cross-origin request; a
# script on another origin must pass a CORS preflight to send it. Requiring it on every
# state-changing API call is the CSRF defence (SameSite does not separate localhost ports).
CSRF_HEADER = "X-Requested-With"
CSRF_VALUE = "XMLHttpRequest"
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _add_csrf_check(app: FastAPI) -> None:
    @app.middleware("http")
    async def require_csrf_header(request: Request, call_next):
        if request.method not in _SAFE_METHODS and request.url.path.startswith("/api/"):
            if request.headers.get(CSRF_HEADER) != CSRF_VALUE:
                return error_response(403, "csrf_check_failed", f"Requests that change data must send the {CSRF_HEADER} header.")
        return await call_next(request)


# The built UI loads only its own scripts and styles. React/Recharts set inline style attributes,
# hence 'unsafe-inline' for styles only; scripts stay restricted to the same origin.
SPA_CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
    "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)


def _add_security_headers(app: FastAPI) -> None:
    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")  # API data is per user and may be sensitive
        elif request.url.path not in ("/docs", "/redoc", "/docs/oauth2-redirect"):  # FastAPI's docs load their own CDN assets
            response.headers.setdefault("Content-Security-Policy", SPA_CSP)
        return response


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    engine = create_db_engine(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info("Starting %s v%s", settings.app_name, __version__)
        init_db(engine, settings)
        yield
        engine.dispose()
        logger.info("Shutdown complete")

    app = FastAPI(title=settings.app_name, version=__version__, lifespan=lifespan)
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)
    app.state.login_throttle = LoginThrottle()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,  # the session cookie; only the explicitly listed origins are allowed
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", CSRF_HEADER],
    )
    # Order matters: the last middleware added runs first. CSRF check -> upload guard -> security headers.
    app.add_middleware(UploadGuard, fastapi_app=app)
    _add_csrf_check(app)
    _add_security_headers(app)
    register_exception_handlers(app)
    app.include_router(api_router)
    _mount_frontend(app, settings.frontend_dist_path)
    return app


app = create_app()
