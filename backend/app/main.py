"""FastAPI application entry point: `uvicorn app.main:app` from the backend directory."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app import __version__
from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.errors import error_response, register_exception_handlers
from app.core.logging import configure_logging
from app.database import create_session_factory, init_db
from app.database.session import create_db_engine

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

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "Authorization"],
    )
    register_exception_handlers(app)
    app.include_router(api_router)
    _mount_frontend(app, settings.frontend_dist_path)
    return app


app = create_app()
