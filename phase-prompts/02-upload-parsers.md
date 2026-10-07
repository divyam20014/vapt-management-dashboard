# Phase 2 — Upload Pipeline + ZAP + Nuclei

Read `CLAUDE.md` and confirm Phase 1 is working before coding.

## Objective
Implement the real upload-to-database workflow and ZAP/Nuclei parsing.

## Implement
- Secure upload endpoint.
- Upload validation:
  extension, MIME type, file size, safe filename, path traversal.
- Original file retention.
- Scan model/service.
- Base parser interface.
- Automatic report/scanner detection.
- Normalized finding model/schema.
- ZAP parser:
  HTML, JSON, XML where supported by the actual report structure.
- Nuclei parser:
  JSON, JSONL, TXT.
- Preserve original fields.
- Normalize severity consistently.
- Extract only information actually present.
- Missing values remain empty/`Not Provided`/`Not Extracted`.
- Finding persistence.
- Scan severity totals.
- Upload analysis summary.
- Upload page with drag/drop and progress states.
- Parser errors with useful user-facing messages.
- Logging.
- Parser fixtures and automated tests.

## Data integrity
Never fabricate evidence, endpoints, recommendations, CVSS, CWE, OWASP or reproduction steps.

## Deduplication
Implement the first safe fingerprint mechanism.
Do not auto-merge uncertain matches.
Represent potential duplicates explicitly.

## Verification
Use real representative ZAP and Nuclei fixtures if available.
Test:
- valid upload;
- invalid extension;
- oversized file;
- malformed JSON;
- unsupported report;
- corrupted/invalid report;
- parser extraction;
- database persistence;
- original file retention;
- severity counts;
- duplicate upload warning.

Then run backend/frontend tests and verify the complete:
Upload → Parse → Normalize → Store → Dashboard flow.

Do not proceed if the core pipeline is broken.
