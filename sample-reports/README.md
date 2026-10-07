# Sample reports (test fixtures only)

These are **real, unmodified scanner outputs**. They are used by the automated tests in `backend/tests/` and are never loaded into the application automatically.

They were generated on 2026-10-07 by scanning a local, deliberately vulnerable target: OWASP Juice Shop (`bkimminich/juice-shop`). It ran in an isolated Docker network as `http://juice:3000`. No external system was scanned.

| File | Tool | How it was produced |
|---|---|---|
| `zap/zap-baseline.json`, `.xml`, `.html` | OWASP ZAP 2.17.0 (`zaproxy/zap-stable`) | `zap-baseline.py -t http://juice:3000 -J … -x … -r … -I -m 2` (passive baseline scan; one run, three report formats) |
| `nuclei/nuclei.json`, `.jsonl`, `.txt` | Nuclei v3 (`projectdiscovery/nuclei`) | `nuclei -u http://juice:3000 -tags misconfig,exposure,tech,headers,generic -nc -o nuclei.txt -je nuclei.json -jle nuclei.jsonl` (one run, three formats) |

Contents:
- ZAP: 11 alert types and 45 instances, with severities Medium, Low and Informational. There is no Critical or High.
- Nuclei: 9 results, all with severity `info`.

Severity levels that do not appear in these files are covered by unit tests on the normalisation functions.

Because each tool's formats come from the same run, the tests also check that the formats normalise to identical findings.

To add fixtures, use real scanner output, record how it was produced in this table, and remove any confidential data first.
