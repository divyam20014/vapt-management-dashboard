# Phase 6 — Authentication, RBAC and Audit

Read `CLAUDE.md`.

## Objective
Add lightweight local authentication and role-based access without overengineering.

## Implement
- Local users.
- Authentication appropriate for a lightweight local application.
- Secure password handling if passwords are introduced.
- Session/token handling.
- Roles:
  Admin
  Security Analyst
  Viewer
- Protect appropriate APIs and UI actions.
- Admin-only management actions.
- Viewer read-only behavior.
- Security Analyst operational access.
- Audit log persistence and UI where useful.
- Record:
  project creation;
  upload;
  finding update;
  status change;
  assignment;
  deletion;
  export;
  bulk update;
  comparison;
  duplicate decisions.

## Security
- Never log credentials/tokens.
- Avoid storing plaintext passwords.
- Validate authorization server-side; frontend hiding is not sufficient.
- Keep the implementation simple and local.

## Verification
Test authentication success/failure.
Test each role against protected actions.
Test audit events.
Test unauthorized API calls.
Run security-focused automated tests.
