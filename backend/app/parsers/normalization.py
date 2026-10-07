"""Normalisation helpers shared by all parsers. None of these functions invent data."""

import hashlib
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

from app.models.enums import Severity

_SEVERITY_MAP = {
    "critical": Severity.CRITICAL,
    "high": Severity.HIGH,
    "medium": Severity.MEDIUM,
    "low": Severity.LOW,
    "informational": Severity.INFORMATIONAL,
    "info": Severity.INFORMATIONAL,
}


def normalize_severity(value: str | None) -> Severity | None:
    """Map a scanner severity label to the standard scale; unknown labels return None."""
    if not isinstance(value, str):
        return None
    return _SEVERITY_MAP.get(value.strip().lower())


def clean(value) -> str | None:
    """Return the string unchanged unless it is empty/whitespace-only (then None)."""
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    return value if value.strip() else None


def html_to_text(value: str | None) -> str | None:
    """Convert scanner-supplied HTML fragments (e.g. ZAP <p> blocks) to plain text."""
    if not clean(value):
        return None
    text = BeautifulSoup(value, "html.parser").get_text("\n")
    lines = [line.strip() for line in text.splitlines()]
    result = "\n".join(line for line in lines if line)
    return result or None


def normalize_title(title: str) -> str:
    return " ".join(title.split())


def endpoint_from_url(url: str | None) -> str | None:
    """scheme://host[:port]/path with query and fragment removed; non-URLs are returned trimmed."""
    if not clean(url):
        return None
    url = url.strip()
    parts = urlsplit(url)
    if not (parts.scheme and parts.netloc):
        return url
    path = parts.path or "/"
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/") or "/"
    return f"{parts.scheme.lower()}://{parts.netloc.lower()}{path}"


def fingerprint(
    project_id: int,
    source_tool: str,
    identity: str,
    endpoint: str | None,
    parameter: str | None,
    http_method: str | None,
) -> str:
    """Stable identity for a finding within a project. Title wording is deliberately not used."""
    parts = [
        str(project_id),
        source_tool.strip().lower(),
        identity.strip().lower(),
        (endpoint or "").strip(),
        (parameter or "").strip(),
        (http_method or "").strip().upper(),
    ]
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()


def parse_iso_datetime(value: str | None) -> datetime | None:
    """Parse RFC 3339 timestamps (nanosecond precision allowed). Returns aware UTC or None."""
    if not clean(value):
        return None
    text = value.strip().replace("Z", "+00:00")
    text = re.sub(r"(\.\d{6})\d+", r"\1", text)  # Python accepts at most microseconds
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def format_cwe(value) -> str | None:
    """'79' / 'cwe-79' / 79 -> 'CWE-79'. Non-positive or non-numeric ids return None."""
    if value is None:
        return None
    match = re.fullmatch(r"(?i)\s*(?:cwe-)?(\d+)\s*", str(value))
    if not match or int(match.group(1)) <= 0:
        return None
    return f"CWE-{int(match.group(1))}"
