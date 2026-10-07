# Phase 4 — Scan History, Comparison and Dashboard

Read `CLAUDE.md`.

## Objective
Build management visibility over scans and remediation progress.

## Implement
### Scan history
- Scan list per project.
- Global scan list.
- Date-wise display.
- Newest-first default sorting.
- Scanner/report type.
- Total and severity counts.
- Processing status.
- Scan detail view.

### Scan comparison
Allow selecting previous/current scans.
Show:
- New findings.
- Resolved findings.
- Persistent findings.
- Reopened findings.

Comparison must use stable finding fingerprints.
Do not compare by title only.

Show enough detail to understand why an item is classified as new/resolved/persistent/reopened.

### Dashboard
Build the professional dashboard:
- projects count;
- scans count;
- total findings;
- severity cards;
- severity distribution;
- findings by project;
- findings over time;
- top categories;
- recent scans;
- recent Critical/High findings;
- remediation/status summary.

All metrics must come from SQLite.

### Project dashboard
Show:
- project metadata;
- latest scan;
- severity totals;
- scan history;
- open findings;
- trends;
- reports.

## Verification
Create controlled test data through actual uploads/DB records.
Verify comparison classifications.
Verify dashboard totals against direct SQLite queries.
Verify project isolation.
Verify newest scan ordering.
Run automated tests and frontend build.
