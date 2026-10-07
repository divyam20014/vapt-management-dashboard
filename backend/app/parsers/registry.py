"""Parser registry and report detection. Register new scanners in PARSERS."""

import json

from defusedxml import DefusedXmlException
from defusedxml import ElementTree as SafeET

from app.parsers.base import BaseReportParser, ReportFile, ReportParseError, UnsupportedReportError
from app.parsers.nuclei import NucleiJsonlParser, NucleiJsonParser, NucleiTxtParser
from app.parsers.zap import ZapHtmlParser, ZapJsonParser, ZapXmlParser

PARSERS: list[BaseReportParser] = [
    ZapJsonParser(),
    ZapXmlParser(),
    ZapHtmlParser(),
    NucleiJsonParser(),
    NucleiJsonlParser(),
    NucleiTxtParser(),
]

SUPPORTED_DESCRIPTION = "OWASP ZAP (HTML, JSON, XML) or Nuclei (JSON, JSONL, TXT)"


def _explain_unreadable(file: ReportFile) -> None:
    """Raise a specific error when the file is not even well-formed for its extension."""
    if file.extension in (".json", ".jsonl"):
        try:
            json.loads(file.text)
            return
        except ValueError as exc:
            if file.extension == ".json":
                raise ReportParseError(f"The file is not valid JSON: {exc}.") from exc
        if not any(line.strip().startswith("{") for line in file.text.splitlines()):
            raise ReportParseError("The file is not valid JSON Lines (one JSON object per line).")
    if file.extension == ".xml":
        try:
            SafeET.fromstring(file.content)
        except DefusedXmlException as exc:
            raise ReportParseError("The XML contains DTD or entity declarations, which are not allowed.") from exc
        except SafeET.ParseError as exc:
            raise ReportParseError(f"The file is not well-formed XML ({exc}).") from exc


def detect_parser(file: ReportFile) -> BaseReportParser:
    _ = file.text  # raises ReportParseError for non-UTF-8 content
    for parser in PARSERS:
        if parser.accepts_extension(file) and parser.can_parse(file):
            return parser
    _explain_unreadable(file)
    raise UnsupportedReportError(
        f"The file was read successfully but was not recognised as an {SUPPORTED_DESCRIPTION} report."
    )
