# Phase 5 — PDF/Excel/CSV, Exports and Bulk Upload

Read `CLAUDE.md`.

## Objective
Complete broad report ingestion and reporting.

## Implement parsers
### PDF
- PyMuPDF/pdfplumber as appropriate.
- Extract text.
- Detect recognizable vulnerability tables where possible.
- Never invent missing fields.
- Use `Not Extracted` when extraction is uncertain.

### Excel
- XLSX.
- Flexible column mapping.
- Handle common synonyms/case variations.
- Show mapping/validation errors clearly when columns cannot be mapped confidently.

### CSV
- Flexible mapping similar to Excel.

### JSON
- Generic JSON support where the structure can be confidently interpreted.
- Do not pretend arbitrary JSON is a VAPT report.

## Bulk upload
- Select multiple reports.
- Validate each file independently.
- Process through the same parser service as single upload.
- Show per-file status.
- Continue processing valid files when appropriate.
- Provide summary:
  succeeded, failed, duplicates, findings added.
- Preserve every original report.

## Exports
Findings:
- CSV
- Excel
- JSON

Project report:
- project information;
- executive summary;
- risk summary;
- severity distribution;
- Critical/High/Medium/Low findings;
- detailed findings;
- remediation summary;
- scan information.

Exports must reflect current SQLite data.

## Verification
Use representative fixtures for:
- PDF;
- XLSX;
- CSV;
- JSON.

Test malformed files and missing columns.
Verify no fabricated values.
Test bulk upload with mixed valid/invalid files.
Verify exports open correctly and contain expected database data.
