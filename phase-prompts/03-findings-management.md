# Phase 3 — Findings Management

Read `CLAUDE.md`.

## Objective
Turn findings into a usable QA/security remediation workspace.

## Implement
- Findings API with server-side pagination.
- Search.
- Sort.
- Filters:
  project, severity, status, source tool, category, date, assignee.
- Finding list UI.
- Finding details page/drawer.
- Original vs normalized values.
- Evidence display.
- Endpoint/URL/method/parameter.
- Description, impact, recommendation, references.
- Status changes:
  Open, In Progress, Resolved, Reopened, Accepted Risk, False Positive, Closed.
- Status history table.
- Assignment.
- Users model/service as needed for assignment.
- Bulk finding selection.
- Bulk status/remediation update.
- Confirmation and selected-count feedback.
- Transactional/consistent bulk update.
- Audit events for updates.
- Critical & High dedicated view.
- Date-wise finding presentation where relevant.

## UX
Use meaningful tables, responsive layouts, readable detail sections, loading/error/empty states.

## Verification
Test:
- API filtering;
- combined filters;
- sorting;
- pagination;
- finding details;
- single status update;
- bulk status update;
- status history;
- assignment;
- audit event creation;
- Critical/High view;
- persistence after refresh.

Do not use frontend-only state as the source of truth.
