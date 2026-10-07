# Sample reports (test fixtures only)

These files are used by the automated tests in `backend/tests/`. They are never loaded into the application automatically.

No finding in this folder is invented. Every file is either real scanner output, or built only from values copied out of real scanner output, as described below.

All scans targeted a local, deliberately vulnerable application, OWASP Juice Shop (`bkimminich/juice-shop`), running in an isolated Docker network. No external system was scanned.

## Real scanner output (unmodified)

| File | Tool | How it was produced |
|---|---|---|
| `zap/zap-baseline.json`, `.xml`, `.html` | OWASP ZAP 2.17.0 (`zaproxy/zap-stable`) | `zap-baseline.py -t http://juice:3000 -J … -x … -r … -I -m 2` (passive baseline scan; one run, three report formats). Generated 2026-10-07. |
| `nuclei/nuclei.json`, `.jsonl`, `.txt` | Nuclei v3 (`projectdiscovery/nuclei`) | `nuclei -u http://juice:3000 -tags misconfig,exposure,tech,headers,generic -nc -o nuclei.txt -je nuclei.json -jle nuclei.jsonl` (one run, three formats). Generated 2026-10-07. |
| `zap/zap-automation.pdf`, `zap/zap-automation.json` | OWASP ZAP 2.17.0 | ZAP Automation Framework (`zap.sh -cmd -autorun plan.yaml`): spider, passive scan, then two report jobs (`traditional-pdf` and `traditional-json`) from **the same scan**, against `http://vapt-fixture-juice:3000`. The JSON is the ground truth used to check the PDF parser. Generated 2026-10-07. |

Contents:
- ZAP baseline: 11 alert types and 45 instances, with severities Medium, Low and Informational. There is no Critical or High.
- Nuclei: 9 results, all with severity `info`.
- ZAP automation run: 4 alert types and 18 instances.
  - The PDF shows no Parameter row, so the parser marks that field **Not Extracted**.
  - One alert detail table and one Evidence value are split across pages, which exercises the page-break handling.

## Derived from the real output (values copied verbatim)

| File | Built by | Purpose |
|---|---|---|
| `tracker/findings-tracker.csv`, `.xlsx`, `findings.json` | `tools/make_tracker_fixtures.py` (re-runnable) | A typical hand-maintained findings tracker, with column names such as "Vulnerability", "Risk Rating", "Proof of Concept" and "Remediation". The XLSX adds a title row and an extra sheet. All 54 rows come from `zap/zap-baseline.json` and `nuclei/nuclei.jsonl`. The Status column is deliberately empty because the scans state no status. |
| `generic/project-report.pdf` | This application: the baseline ZAP and Nuclei reports uploaded to a project, the project report exported, then printed to PDF with headless Microsoft Edge (A4) | A PDF that contains a findings table (48 rows, repeated headers, a row split across a page break, and wrapped cells) plus smaller summary tables. |

Severity levels that do not appear in these files are covered by unit tests on the normalisation functions. Edge cases (encodings, ambiguous columns, malformed or unsafe files) use small inputs built inside the tests. Those inputs contain no finding content presented as real.

To add fixtures, use real scanner output, record how it was produced in these tables, and remove any confidential data first.
