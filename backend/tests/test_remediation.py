"""Phase 7: standard remediation library and exact finding-to-guideline links."""

import re
from collections import Counter

import pytest

from app.main import create_app
from app.remediation.library import GUIDELINES
from tests.conftest import admin_session
from tests.fixtures import NUCLEI_JSONL, SAMPLE_REPORTS, ZAP_JSON

# CWEs that cover many unrelated issues; a match on these would be a guess.
BROAD_CWES = {"CWE-16", "CWE-20", "CWE-200", "CWE-264", "CWE-284", "CWE-693", "CWE-noinfo", "CWE-Other"}


def upload(client, project_id, path, name=None, content=None):
    response = client.post(
        "/api/scans/upload",
        data={"project_id": str(project_id)},
        files={"file": (name or path.name, content if content is not None else path.read_bytes(), "application/octet-stream")},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def loaded(client):
    project = client.post("/api/projects", json={"name": "Juice Shop"}).json()
    upload(client, project["id"], ZAP_JSON)
    upload(client, project["id"], NUCLEI_JSONL)
    return project


def all_findings(client, project_id):
    items, page = [], 1
    while True:
        data = client.get("/api/findings", params={"project_id": project_id, "page": page, "page_size": 100}).json()
        items += data["items"]
        if len(items) >= data["total"]:
            return items
        page += 1


# --- Library content --------------------------------------------------------------------------

def test_library_rules_are_unambiguous():
    slugs = [g["slug"] for g in GUIDELINES]
    assert len(slugs) == len(set(slugs))
    for key in ("cwe", "zap", "nuclei"):
        counts = Counter(rule for g in GUIDELINES for rule in g[key])
        assert not [r for r, n in counts.items() if n > 1], f"{key} rule listed by more than one guideline"
    cwes = {c for g in GUIDELINES for c in g["cwe"]}
    assert not cwes & BROAD_CWES
    assert all(re.fullmatch(r"CWE-\d+", c) for c in cwes)
    assert all(re.fullmatch(r"\d+", z) for g in GUIDELINES for z in g["zap"])
    nuclei = [r for g in GUIDELINES for r in g["nuclei"]]
    plain = {r for r in nuclei if ":" not in r}
    assert not plain & {r.split(":")[0] for r in nuclei if ":" in r}, "a template has both template- and matcher-level rules"


def test_library_entries_are_complete_and_cite_https_sources():
    for g in GUIDELINES:
        assert g["title"] and g["summary"] and g["category"] and g["steps"] and g["verification"], g["slug"]
        assert g["references"] and all(r["url"].startswith("https://") and r["title"] for r in g["references"]), g["slug"]


def test_library_is_synced_once_and_survives_restart(app, settings, sqlite_rows):
    with admin_session(app) as c:
        assert c.get("/api/remediation").json()["total"] == len(GUIDELINES)
    with admin_session(create_app(settings)):
        pass
    assert sqlite_rows("SELECT COUNT(*) FROM remediation_guidelines") == [(len(GUIDELINES),)]


# --- Finding links ----------------------------------------------------------------------------

def test_scanner_rule_links_on_real_reports(client, loaded):
    by_title = {f["normalized_title"]: f["id"] for f in all_findings(client, loaded["id"])}

    def guidance(title):
        return client.get(f"/api/findings/{by_title[title]}").json()["standard_guidance"]

    csp_zap = guidance("Content Security Policy (CSP) Header Not Set")
    assert [(g["slug"], g["match_type"], g["basis"]) for g in csp_zap] == [("content-security-policy", "scanner_rule", "OWASP ZAP alert 10038")]
    csp_nuclei = guidance("HTTP Missing Security Headers: content-security-policy")
    assert [(g["slug"], g["basis"]) for g in csp_nuclei] == [
        ("content-security-policy", "Nuclei template http-missing-security-headers (content-security-policy)")
    ]
    assert [g["slug"] for g in guidance("Public Swagger API - Detect")] == ["exposed-api-documentation"]
    assert [g["slug"] for g in guidance("Cross-Domain Misconfiguration")] == ["cross-origin-resource-sharing"]
    # No exact rule: no guidance, rather than a guess from the title or a broad CWE.
    assert guidance("Modern Web Application") == []
    assert guidance("HTTP Missing Security Headers: x-permitted-cross-domain-policies") == []


def test_report_recommendation_is_never_changed(client, loaded):
    import json

    zap = json.loads(ZAP_JSON.read_text(encoding="utf-8"))
    alert = next(a for site in zap["site"] for a in site["alerts"] if a["pluginid"] == "10038")
    fid = next(f["id"] for f in all_findings(client, loaded["id"]) if f["normalized_title"] == "Content Security Policy (CSP) Header Not Set")
    detail = client.get(f"/api/findings/{fid}").json()
    assert detail["standard_guidance"]  # guidance is shown alongside …
    # … but the stored recommendation is still the report's own text (HTML tags removed only).
    assert re.sub(r"\s+", " ", detail["recommendation"]).strip() == re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", alert["solution"])).strip()


def test_cwe_link_is_used_only_without_a_scanner_rule(client):
    project = client.post("/api/projects", json={"name": "Tracker"}).json()
    csv = (
        "Vulnerability,Severity,CWE,URL,Tool\n"
        "Reflected input in search,High,CWE-79,https://app.example/search,Burp Suite\n"
        "Header issue,Low,CWE-693,https://app.example/,Burp Suite\n"
        "Two weaknesses,Medium,\"CWE-89, CWE-22\",https://app.example/files,Burp Suite\n"
    ).encode()
    upload(client, project["id"], None, name="tracker.csv", content=csv)
    found = {f["normalized_title"]: f["id"] for f in all_findings(client, project["id"])}

    def guidance(title):
        return [(g["slug"], g["match_type"], g["basis"]) for g in client.get(f"/api/findings/{found[title]}").json()["standard_guidance"]]

    assert guidance("Reflected input in search") == [("cross-site-scripting", "cwe", "CWE-79")]
    assert guidance("Header issue") == []  # CWE-693 is too broad to map
    assert sorted(guidance("Two weaknesses")) == [("path-traversal", "cwe", "CWE-22"), ("sql-injection", "cwe", "CWE-89")]


def test_sql_filter_and_counts_agree_with_finding_detail(client, loaded):
    """The findings filter (SQL) and the finding detail (Python) apply the same rules."""
    expected: dict[str, set[int]] = {}
    for f in all_findings(client, loaded["id"]):
        for g in client.get(f"/api/findings/{f['id']}").json()["standard_guidance"]:
            expected.setdefault(g["slug"], set()).add(f["id"])
    assert len(expected) >= 5

    library = {g["slug"]: g for g in client.get("/api/remediation").json()["items"]}
    for slug, guideline in library.items():
        filtered = client.get("/api/findings", params={"remediation": slug, "page_size": 100}).json()
        assert {i["id"] for i in filtered["items"]} == expected.get(slug, set()), slug
        assert guideline["findings"] == filtered["total"], slug
        assert guideline["active_findings"] <= guideline["findings"]


def test_library_search_detail_and_errors(client, login_as):
    viewer = login_as("Viewer")  # every role can read the library
    everything = viewer.get("/api/remediation").json()
    assert everything["total"] == len(GUIDELINES) and "Security headers" in everything["categories"]
    assert [g["slug"] for g in viewer.get("/api/remediation", params={"search": "CWE-79"}).json()["items"]] == ["cross-site-scripting"]
    assert "clickjacking-protection" in {g["slug"] for g in viewer.get("/api/remediation", params={"search": "framing"}).json()["items"]}
    assert "content-security-policy" in {g["slug"] for g in viewer.get("/api/remediation", params={"search": "10038"}).json()["items"]}
    injection = viewer.get("/api/remediation", params={"category": "Injection"}).json()["items"]
    assert injection and all(g["category"] == "Injection" for g in injection)

    detail = viewer.get("/api/remediation/content-security-policy").json()
    assert detail["zap_rules"] == ["10038", "10055"] and detail["steps"] and detail["references"][0]["url"].startswith("https://")
    assert viewer.get("/api/remediation/no-such-guideline").status_code == 404
    assert viewer.get("/api/findings", params={"remediation": "no-such-guideline"}).status_code == 404


def test_findings_export_records_the_guideline_filter(client, loaded):
    response = client.get("/api/exports/findings", params={"format": "json", "remediation": "content-security-policy"})
    body = response.json()
    total = client.get("/api/findings", params={"remediation": "content-security-policy"}).json()["total"]
    assert body["filters"]["remediation"] == "content-security-policy" and body["count"] == total == 5  # 4 ZAP endpoints + 1 Nuclei


def test_project_report_separates_standard_guidance_from_report_recommendations(client, loaded):
    page = client.get(f"/api/exports/projects/{loaded['id']}/report").text
    section = page[page.index("<h3>Standard remediation guidance</h3>"):page.index("<h2>Scan information</h2>")]
    assert "scanners' own text and are unchanged" in section
    library = {g["slug"]: g for g in client.get("/api/remediation").json()["items"]}
    csp = library["content-security-policy"]
    assert f"Define a Content Security Policy</strong>" in section
    row = section[section.index("Define a Content Security Policy"):]
    row = row[: row.index("</tr>")]
    assert f"<td>{csp['active_findings']}</td><td>{csp['findings']}</td>" in row
    assert "finding(s) have no standard guideline" in section
