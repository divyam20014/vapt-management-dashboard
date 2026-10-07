# Phase 1 — Foundation

Read `CLAUDE.md` first.

## Objective
Build the working application foundation. Do not implement report parsing yet.

## Implement
- Repository structure.
- React + TypeScript + Vite frontend.
- Tailwind CSS.
- React Router.
- Lucide icons.
- Recharts dependency and dashboard-ready structure.
- FastAPI backend.
- Pydantic schemas.
- SQLAlchemy setup.
- SQLite initialization.
- Project model and CRUD.
- Basic database indexes where appropriate.
- CORS/configuration.
- Logging foundation.
- Global backend error handling.
- Professional application shell.
- Sidebar navigation:
  Dashboard, Projects, Findings, Critical & High, Scans, Reports, Upload Report, Settings.
- Dashboard foundation using real database values.
- Projects page.
- Create/edit project flow.
- Empty/loading/error states.
- README initial setup instructions.
- Docker foundation with persistent `./data`.

## Important
Do not create fake dashboard numbers.
If there is no data, show zero/empty states.

Do not implement:
- parser logic;
- AI;
- active scanning;
- complex authentication;
- fake findings.

## Verification
Run:
- backend tests;
- frontend tests/build;
- backend startup;
- frontend startup;
- project CRUD through API;
- create a project through UI;
- reload and verify it persists in SQLite;
- verify dashboard reads SQLite.

## Completion report
Return:
1. implemented features;
2. files changed;
3. database schema;
4. APIs;
5. tests/results;
6. manual verification;
7. known limitations;
8. exact next phase.
