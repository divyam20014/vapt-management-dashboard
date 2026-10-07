"""OWASP ZAP "traditional" reports: JSON, XML and HTML.

Each alert instance (URL + method + parameter) becomes one record. Fields are taken only from the
report; ZAP's sentinel values (empty strings, CWE/WASC id -1 or 0) are treated as absent.
Structures verified against ZAP 2.17 report output (see sample-reports/zap/).
"""

import re
from datetime import datetime, timezone
from typing import Any

from bs4 import BeautifulSoup
from defusedxml import DefusedXmlException
from defusedxml import ElementTree as SafeET

from app.models.enums import ReportType, Scanner
from app.parsers.base import BaseReportParser, NormalizedFinding, ParsedReport, ReportFile, ReportParseError
from app.parsers.normalization import (
    clean,
    endpoint_from_url,
    format_cwe,
    html_to_text,
    normalize_severity,
    normalize_title,
    parse_iso_datetime,
)

SOURCE_TOOL = Scanner.ZAP.value
ZAP_DATE_FORMAT = "%a, %d %b %Y %H:%M:%S"
NAIVE_DATE_WARNING = "The report's generation time has no timezone; it was stored as UTC."

_RISK_CODES = {"0": "Informational", "1": "Low", "2": "Medium", "3": "High"}
_CONFIDENCE_CODES = {"0": "False Positive", "1": "Low", "2": "Medium", "3": "High", "4": "User Confirmed"}
_RISKDESC = re.compile(r"^\s*(?P<risk>[^()]+?)\s*(?:\((?P<confidence>[^()]*)\))?\s*$")


def _parse_zap_date(created: str | None, generated: str | None, warnings: list[str]) -> datetime | None:
    if parsed := parse_iso_datetime(created):
        return parsed
    if clean(generated):
        try:
            naive = datetime.strptime(generated.strip(), ZAP_DATE_FORMAT)
        except ValueError:
            warnings.append(f'The report date "{generated.strip()}" could not be read and was not stored.')
            return None
        warnings.append(NAIVE_DATE_WARNING)
        return naive.replace(tzinfo=timezone.utc)
    return None


def _positive_id(value) -> str | None:
    text = clean(value)
    if text is None:
        return None
    text = text.strip()
    return text if text.isdigit() and int(text) > 0 else None


def _records_from_alerts(site: str | None, alerts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records = []
    for alert in alerts:
        instances = alert.get("instances") or []
        base = {key: value for key, value in alert.items() if key != "instances"}
        if not instances:
            records.append({"site": site, "alert": base, "instance": None})
        for instance in instances:
            records.append({"site": site, "alert": base, "instance": instance})
    return records


def normalize_zap_record(record: dict[str, Any], fields_are_html: bool) -> NormalizedFinding:
    alert: dict[str, Any] = record["alert"]
    instance: dict[str, Any] = record.get("instance") or {}
    to_text = html_to_text if fields_are_html else (lambda value: clean(value) and value.strip())

    title = clean(alert.get("alert")) or clean(alert.get("name"))
    if title is None:
        raise ReportParseError("A ZAP alert has no name.")

    risk = confidence = None
    if match := _RISKDESC.match(alert.get("riskdesc") or ""):
        risk, confidence = match.group("risk"), clean(match.group("confidence"))
    risk = clean(risk) or clean(alert.get("risk")) or _RISK_CODES.get(str(alert.get("riskcode", "")).strip())
    confidence = confidence or clean(alert.get("confidencedesc")) or _CONFIDENCE_CODES.get(str(alert.get("confidence", "")).strip())

    plugin_id = _positive_id(alert.get("pluginid"))
    uri = clean(instance.get("uri"))
    method = clean(instance.get("method"))

    metadata = {
        "alert_ref": clean(alert.get("alertRef")),
        "confidence": confidence,
        "wasc": f"WASC-{wasc}" if (wasc := _positive_id(alert.get("wascid"))) else None,
        "attack": clean(instance.get("attack")),
        "other_info": to_text(instance.get("otherinfo")) or to_text(alert.get("otherinfo")),
        "site": clean(record.get("site")),
        "systemic": alert.get("systemic") if isinstance(alert.get("systemic"), bool) else None,
    }

    normalized = normalize_title(title)
    return NormalizedFinding(
        original_title=title,
        normalized_title=normalized,
        original_severity=risk,
        normalized_severity=normalize_severity(risk),
        source_tool=SOURCE_TOOL,
        # The HTML report has no alertRef, so plugin id + alert name identifies the check in every format.
        identity=f"{plugin_id or ''}:{normalized.lower()}",
        raw_record=record,
        source_template=plugin_id,
        description=to_text(alert.get("desc")),
        recommendation=to_text(alert.get("solution")),
        source_reference=to_text(alert.get("reference")),
        affected_url=uri,
        endpoint=endpoint_from_url(uri),
        parameter=clean(instance.get("param")),
        http_method=method.strip().upper() if method else None,
        evidence=clean(instance.get("evidence")),  # stored verbatim
        cwe=format_cwe(alert.get("cweid")),
        source_metadata={key: value for key, value in metadata.items() if value is not None},
    )


class ZapJsonParser(BaseReportParser):
    scanner = Scanner.ZAP
    report_type = ReportType.JSON
    extensions = (".json",)

    def can_parse(self, file: ReportFile) -> bool:
        data = file.try_json()
        return (
            isinstance(data, dict)
            and isinstance(data.get("site"), list)
            and ("@version" in data or "@programName" in data)
        )

    def parse(self, file: ReportFile) -> ParsedReport:
        data = file.json
        warnings: list[str] = []
        records = []
        for site in data["site"]:
            if not isinstance(site, dict):
                raise ReportParseError("The ZAP JSON report has an invalid 'site' entry.")
            records.extend(_records_from_alerts(site.get("@name"), site.get("alerts") or []))
        scan_date = _parse_zap_date(data.get("created"), data.get("@generated"), warnings)
        return ParsedReport(records=records, scan_date=scan_date, warnings=warnings)

    def normalize(self, record):
        return normalize_zap_record(record, fields_are_html=True)


class ZapXmlParser(BaseReportParser):
    scanner = Scanner.ZAP
    report_type = ReportType.XML
    extensions = (".xml",)

    def can_parse(self, file: ReportFile) -> bool:
        return "<OWASPZAPReport" in file.text[:4096]

    def parse(self, file: ReportFile) -> ParsedReport:
        try:
            root = SafeET.fromstring(file.content)
        except DefusedXmlException as exc:
            raise ReportParseError("The XML contains DTD or entity declarations, which are not allowed.") from exc
        except SafeET.ParseError as exc:
            raise ReportParseError(f"The ZAP XML report is not well-formed ({exc}).") from exc
        if root.tag != "OWASPZAPReport":
            raise ReportParseError("The XML root element is not <OWASPZAPReport>.")

        records = []
        for site in root.findall("site"):
            alerts = []
            for item in site.findall("./alerts/alertitem"):
                alert = {child.tag: child.text or "" for child in item if child.tag != "instances"}
                alert["instances"] = [
                    {child.tag: child.text or "" for child in instance}
                    for instance in item.findall("./instances/instance")
                ]
                alerts.append(alert)
            records.extend(_records_from_alerts(site.get("name"), alerts))
        warnings: list[str] = []
        scan_date = _parse_zap_date(root.get("created"), root.get("generated"), warnings)
        return ParsedReport(records=records, scan_date=scan_date, warnings=warnings)

    def normalize(self, record):
        return normalize_zap_record(record, fields_are_html=True)


# Labels used in the HTML report's per-alert "results" tables.
_HTML_ALERT_FIELDS = {
    "Description": "desc",
    "Instances": "count",
    "Solution": "solution",
    "Reference": "reference",
    "CWE Id": "cweid",
    "WASC Id": "wascid",
    "Plugin Id": "pluginid",
    "Other information": "otherinfo",
}
_HTML_INSTANCE_FIELDS = {
    "Node Name": "nodeName",
    "Method": "method",
    "Parameter": "param",
    "Attack": "attack",
    "Evidence": "evidence",
    "Other Info": "otherinfo",
}
_HTML_GENERATED = re.compile(r"Generated on\s+(.+)")


class ZapHtmlParser(BaseReportParser):
    """Untrusted HTML is parsed as data with html.parser; nothing is rendered or executed."""

    scanner = Scanner.ZAP
    report_type = ReportType.HTML
    extensions = (".html", ".htm")

    def can_parse(self, file: ReportFile) -> bool:
        head = file.text[:8192]
        return "<title>ZAP Scanning Report</title>" in head or ("ZAP Scanning Report" in head and "zaproxy" in file.text)

    def parse(self, file: ReportFile) -> ParsedReport:
        soup = BeautifulSoup(file.text, "html.parser")
        site_heading = soup.find("h2")
        site = None
        if site_heading and (text := site_heading.get_text(" ", strip=True)).startswith("Site:"):
            site = text.removeprefix("Site:").strip()

        alerts = []
        for table in soup.select("table.results"):
            header = table.find("tr")
            cells = header.find_all("th") if header else []
            if len(cells) < 2:
                raise ReportParseError("A ZAP HTML alert table has no header row.")
            alert: dict[str, Any] = {"risk": cells[0].get_text(strip=True), "alert": cells[1].get_text(strip=True), "instances": []}
            current: dict[str, Any] | None = None
            for row in table.find_all("tr")[1:]:
                tds = row.find_all("td", recursive=False)
                if len(tds) != 2:
                    continue
                label = tds[0].get_text(strip=True)
                if label == "URL":
                    current = {"uri": tds[1].get_text(strip=True)}
                    alert["instances"].append(current)
                elif current is not None and label in _HTML_INSTANCE_FIELDS and "indent2" in (tds[0].get("class") or []):
                    # Evidence is kept exactly as rendered in the report cell.
                    current[_HTML_INSTANCE_FIELDS[label]] = tds[1].get_text()
                elif label in _HTML_ALERT_FIELDS:
                    current = None
                    alert[_HTML_ALERT_FIELDS[label]] = tds[1].get_text("\n", strip=True)
            alerts.append(alert)

        warnings: list[str] = []
        generated = None
        for heading in soup.find_all("h3"):
            if match := _HTML_GENERATED.search(heading.get_text(" ", strip=True)):
                generated = match.group(1)
                break
        scan_date = _parse_zap_date(None, generated, warnings)
        return ParsedReport(records=_records_from_alerts(site, alerts), scan_date=scan_date, warnings=warnings)

    def normalize(self, record):
        return normalize_zap_record(record, fields_are_html=False)
