"""Upload validation and safe storage of original reports."""

import hashlib
import logging
import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import BinaryIO

from app.core.errors import AppError

logger = logging.getLogger(__name__)

CHUNK_SIZE = 1024 * 1024
MAX_FILENAME_LENGTH = 255

ALLOWED_EXTENSIONS = (".html", ".htm", ".json", ".jsonl", ".xml", ".txt")

_GENERIC_TYPES = {"", "application/octet-stream", "text/plain"}
ALLOWED_CONTENT_TYPES: dict[str, set[str]] = {
    ".html": {"text/html", "application/xhtml+xml"} | _GENERIC_TYPES,
    ".htm": {"text/html", "application/xhtml+xml"} | _GENERIC_TYPES,
    ".json": {"application/json", "text/json"} | _GENERIC_TYPES,
    ".jsonl": {"application/jsonl", "application/x-ndjson", "application/x-jsonlines", "application/json"} | _GENERIC_TYPES,
    ".xml": {"application/xml", "text/xml"} | _GENERIC_TYPES,
    ".txt": _GENERIC_TYPES,
}

# Signatures of binary/executable formats that must never be accepted as reports.
_BINARY_SIGNATURES = {
    b"MZ": "Windows executable",
    b"\x7fELF": "ELF executable",
    b"PK\x03\x04": "ZIP archive",
    b"%PDF": "PDF document",
    b"\xca\xfe\xba\xbe": "Mach-O/Java binary",
    b"#!": "script",
}

_UNSAFE_NAME_CHARS = re.compile(r"[^A-Za-z0-9._-]+")


class UploadValidationError(AppError):
    status_code = 400
    code = "invalid_upload"


class UploadTooLargeError(AppError):
    status_code = 413
    code = "file_too_large"


class UnsupportedMediaError(AppError):
    status_code = 415
    code = "unsupported_media_type"


def validate_filename(filename: str | None) -> tuple[str, str]:
    """Return (filename, extension). Rejects anything resembling a path."""
    if not filename or not filename.strip():
        raise UploadValidationError("The uploaded file has no name.")
    name = filename.strip()
    if len(name) > MAX_FILENAME_LENGTH:
        raise UploadValidationError(f"File name is longer than {MAX_FILENAME_LENGTH} characters.")
    if any(ord(char) < 32 for char in name):
        raise UploadValidationError("File name contains control characters.")
    if "/" in name or "\\" in name or ":" in name:
        raise UploadValidationError("File name must not contain path separators or drive letters.")
    if name in (".", "..") or name.startswith(".."):
        raise UploadValidationError("File name must not reference a parent directory.")
    extension = PurePosixPath(name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(ALLOWED_EXTENSIONS)
        raise UnsupportedMediaError(f'File type "{extension or "(none)"}" is not supported. Allowed: {allowed}.')
    return name, extension


def validate_content_type(content_type: str | None, extension: str) -> None:
    declared = (content_type or "").split(";")[0].strip().lower()
    if declared not in ALLOWED_CONTENT_TYPES[extension]:
        raise UnsupportedMediaError(f'Content type "{declared}" does not match a {extension} report.')


def read_limited(stream: BinaryIO, max_bytes: int) -> bytes:
    """Read the upload in chunks, stopping as soon as the size limit is exceeded."""
    chunks: list[bytes] = []
    total = 0
    while chunk := stream.read(CHUNK_SIZE):
        total += len(chunk)
        if total > max_bytes:
            raise UploadTooLargeError(f"File exceeds the maximum upload size of {max_bytes // (1024 * 1024)} MB.")
        chunks.append(chunk)
    content = b"".join(chunks)
    if not content.strip():
        raise UploadValidationError("The uploaded file is empty.")
    return content


def validate_content(content: bytes) -> None:
    """Reports must be text. Binary and executable content is rejected."""
    for signature, label in _BINARY_SIGNATURES.items():
        if content.startswith(signature):
            raise UnsupportedMediaError(f"The file content looks like a {label}, not a text report.")
    if b"\x00" in content[:8192]:
        raise UnsupportedMediaError("The file contains binary data and is not a text report.")


def sha256_hex(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


@dataclass
class StoredFile:
    relative_path: str
    absolute_path: Path


def store_original(upload_root: Path, project_id: int, filename: str, content: bytes, when: datetime) -> StoredFile:
    """Write the original report to <upload_root>/<project_id>/<YYYY-MM-DD>/<uuid>_<safe-name>."""
    safe_name = _UNSAFE_NAME_CHARS.sub("_", filename).strip("._") or "report"
    safe_name = safe_name[-100:]
    relative = PurePosixPath(str(project_id), when.strftime("%Y-%m-%d"), f"{uuid.uuid4().hex}_{safe_name}")
    root = upload_root.resolve()
    target = (root / relative).resolve()
    if not target.is_relative_to(root):  # defence in depth; safe_name cannot contain separators
        raise UploadValidationError("Invalid storage path.")
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "xb") as handle:  # never overwrite an existing file
        handle.write(content)
    logger.info("Stored original report project=%s path=%s bytes=%d", project_id, relative, len(content))
    return StoredFile(relative_path=relative.as_posix(), absolute_path=target)
