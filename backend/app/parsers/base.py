"""Scanner-independent parser contract.

Adding a scanner = subclass BaseReportParser and register it in parsers/registry.py.
Parsers must only extract values that are present in the report; absent values stay None.
"""

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from functools import cached_property
from typing import Any

from app.core.errors import AppError
from app.models.enums import ReportType, Scanner, Severity


class ReportParseError(AppError):
    """The file was recognised (or expected) as a report but could not be read."""

    status_code = 422
    code = "parse_error"


class UnsupportedReportError(AppError):
    """The file is readable but is not a report format this application supports."""

    status_code = 422
    code = "unsupported_report"


@dataclass
class ReportFile:
    filename: str
    extension: str  # lower-case, including the dot
    content: bytes

    @cached_property
    def text(self) -> str:
        try:
            return self.content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ReportParseError("The file is not valid UTF-8 text.") from exc

    @cached_property
    def json(self) -> Any:
        """Parsed JSON document, or raises ValueError."""
        return json.loads(self.text)

    def try_json(self) -> Any | None:
        try:
            return self.json
        except ValueError:
            return None


@dataclass
class NormalizedFinding:
    original_title: str
    normalized_title: str
    original_severity: str | None
    normalized_severity: Severity | None
    source_tool: str
    # Scanner-native identity of the check (e.g. ZAP alertRef, Nuclei template-id[:matcher]).
    identity: str
    raw_record: dict[str, Any]
    source_template: str | None = None
    description: str | None = None
    impact: str | None = None
    recommendation: str | None = None
    affected_url: str | None = None
    endpoint: str | None = None
    parameter: str | None = None
    http_method: str | None = None
    evidence: str | None = None
    steps_to_reproduce: str | None = None
    source_reference: str | None = None
    cwe: str | None = None
    owasp: str | None = None
    cvss_score: float | None = None
    category: str | None = None
    subcategory: str | None = None
    source_metadata: dict[str, Any] = field(default_factory=dict)
    # False when the method is inferred (not a reported field), so it must not affect identity.
    method_in_identity: bool = True

    @property
    def identity_method(self) -> str | None:
        return self.http_method if self.method_in_identity else None


@dataclass
class ParsedReport:
    records: list[dict[str, Any]]
    scan_date: datetime | None = None
    warnings: list[str] = field(default_factory=list)


class BaseReportParser(ABC):
    scanner: Scanner
    report_type: ReportType
    extensions: tuple[str, ...]

    @property
    def name(self) -> str:
        return f"{self.scanner.value} {self.report_type.value}"

    def accepts_extension(self, file: ReportFile) -> bool:
        return file.extension in self.extensions

    @abstractmethod
    def can_parse(self, file: ReportFile) -> bool:
        """Cheap structural check: does this file look like this parser's format?"""

    @abstractmethod
    def parse(self, file: ReportFile) -> ParsedReport:
        """Extract raw records exactly as they appear in the report."""

    @abstractmethod
    def normalize(self, record: dict[str, Any]) -> NormalizedFinding:
        """Map one raw record to a NormalizedFinding without inventing values."""
