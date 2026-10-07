"""Checks on upload requests *before* their body is read.

FastAPI parses a multipart body (spooling files to temporary storage) before it runs route
dependencies, so without this guard an anonymous caller could stream an arbitrarily large body
before receiving 401. This ASGI middleware, for the upload routes only:
1. refuses a declared Content-Length above the upload limit (413);
2. refuses callers without a valid session or without upload permission (401/403);
3. stops a body that streams past the limit, whatever Content-Length said (413).
The route itself still performs every check again; this only fails earlier and cheaper.
"""

from anyio import to_thread
from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import AppError, error_response
from app.core.permissions import Permission, has_permission

UPLOAD_PATHS = {"/api/scans/upload": 1, "/api/scans/upload-bulk": None}  # None: bulk (MAX_BULK_FILES files)
MULTIPART_OVERHEAD = 1024 * 1024


class UploadGuard:
    def __init__(self, app: ASGIApp, fastapi_app) -> None:
        self.app = app
        self.fastapi_app = fastapi_app

    def _limit(self, files: int | None) -> int:
        from app.services.scan_service import MAX_BULK_FILES

        per_file = self.fastapi_app.state.settings.max_upload_size_mb * 1024 * 1024
        return per_file * (files or MAX_BULK_FILES) + MULTIPART_OVERHEAD

    def _check_session(self, token: str | None) -> None:
        from app.services import auth_service

        db = self.fastapi_app.state.session_factory()
        try:
            user = auth_service.resolve_session(db, self.fastapi_app.state.settings, token)
            if not has_permission(user.role, Permission.REPORTS_UPLOAD):
                raise _Forbidden(f"Your role ({user.role.value}) does not allow this action.")
        finally:
            db.close()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] != "POST" or scope["path"] not in UPLOAD_PATHS:
            await self.app(scope, receive, send)
            return

        limit = self._limit(UPLOAD_PATHS[scope["path"]])
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        declared = headers.get("content-length", "")
        if declared.isdigit() and int(declared) > limit:
            await _reject(scope, receive, send, 413, "file_too_large", "The upload is larger than the configured limit.")
            return

        from app.services.auth_service import SESSION_COOKIE

        token = _cookie(headers.get("cookie", ""), SESSION_COOKIE)
        try:
            await to_thread.run_sync(self._check_session, token)
        except AppError as exc:
            await _reject(scope, receive, send, exc.status_code, exc.code, exc.message)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    # Raised inside body parsing; FastAPI re-raises HTTPException unchanged.
                    raise HTTPException(413, "The upload is larger than the configured limit.")
            return message

        await self.app(scope, limited_receive, send)


class _Forbidden(AppError):
    status_code = 403
    code = "forbidden"


def _cookie(header: str, name: str) -> str | None:
    for part in header.split(";"):
        key, _, value = part.strip().partition("=")
        if key == name:
            return value or None
    return None


async def _reject(scope: Scope, receive: Receive, send: Send, status: int, code: str, message: str) -> None:
    response = error_response(status, code, message)
    response.headers["Connection"] = "close"  # the unread body is discarded with the connection
    await response(scope, receive, send)
