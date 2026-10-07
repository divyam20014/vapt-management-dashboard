# Phase 7 — Remediation Library, UX Polish and Hardening

Read `CLAUDE.md`.

## Objective
Make the product feel complete, professional and useful to a QA Manager, Project Manager, Security Analyst and Developer.

## Remediation library
Implement:
- standard remediation guidance records;
- mappings to common vulnerability categories/types;
- finding-to-guideline association where confident;
- separate Original Recommendation from Standard Remediation Guidance;
- searchable remediation library.

Never overwrite original scanner recommendations.

## UX polish
Review every major screen:
- Dashboard
- Projects
- Project details
- Findings
- Finding details
- Critical & High
- Scans
- Scan comparison
- Reports
- Upload
- Bulk upload
- Settings

Improve:
- responsive grid;
- spacing;
- table usability;
- modal/drawer dimensions;
- menu labels;
- navigation hierarchy;
- loading states;
- empty states;
- error messages;
- accessibility;
- visual consistency;
- meaningful management indicators.

## Quality hardening
Review:
- upload security;
- path traversal;
- untrusted HTML handling;
- authorization;
- error handling;
- database transactions;
- duplicate handling;
- pagination;
- large report behavior;
- logging;
- original evidence preservation.

## Performance
Avoid:
- loading all findings into the browser unnecessarily;
- N+1 queries;
- repeated dashboard queries when one aggregated query can be used;
- blocking UI during large uploads.

## Documentation
Finalize README:
- architecture;
- installation;
- local development;
- Docker;
- database;
- supported reports;
- parser extension;
- API docs;
- tests;
- troubleshooting;
- limitations.

## Final verification
Run the complete automated suite.
Build frontend.
Start backend.
Perform end-to-end smoke test:
1. Create project.
2. Upload ZAP.
3. Upload Nuclei.
4. Review findings.
5. Bulk update status.
6. Compare scans.
7. Upload bulk reports.
8. Export findings.
9. Export project report.
10. Verify audit trail.
11. Restart application.
12. Verify SQLite and uploaded reports persist.

Report any unverified item honestly.

Do not add active scanner execution or mandatory AI unless explicitly requested later.
