# VAPT Management Dashboard

A lightweight, local-first web application that QA and security teams use to manage projects and their VAPT (Vulnerability Assessment and Penetration Testing) reports.

Uploaded reports are the source of truth. The application never invents findings, evidence or scores.

> **Status: Phase 4 (Scan history, comparison and dashboards).** Phase 4 adds:
> - a global and per-project scan history, ordered by scan date;
> - scan detail pages and download of the original report;
> - fingerprint-based scan comparison;
> - a portfolio dashboard and per-project dashboards, every number calculated from SQLite.
>
> Phase 3 (findings management) remains: You can upload OWASP ZAP and Nuclei reports, then work through the findings. The Findings and Critical & High views offer server-side search, filters, sorting and pagination. Each finding has a detail page with report values and evidence, and you can track status, history and assignment, including bulk updates.
> Exports, bulk upload, PDF/Excel/CSV parsing and authentication are **not implemented yet**. See [Roadmap](#roadmap).

---

## Architecture

```text
React + TypeScript (Vite)      frontend/
        │  REST /api/*
FastAPI routers                backend/app/api/
Pydantic schemas               backend/app/schemas/
Service layer                  backend/app/services/
SQLAlchemy models              backend/app/models/, backend/app/database/
SQLite + local file storage    data/vapt.db, data/uploads/, exports/
```

- **Development:** Vite (`:5173`) proxies `/api` to FastAPI (`:8000`).
- **Docker:** a single image is used. FastAPI serves the compiled frontend and the API on port `8000`.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Axios, Recharts, Lucide React |
| Backend | Python 3.11+, FastAPI, Pydantic v2, pydantic-settings, SQLAlchemy 2 |
| Database | SQLite (`data/vapt.db`) |
| Tests | pytest + FastAPI TestClient; Vitest + React Testing Library |

## Folder structure

```text
├── backend/
│   ├── app/
│   │   ├── main.py          app factory, CORS, error handlers, SPA serving
│   │   ├── api/             routers: health, projects, scans (upload), findings, users, dashboard, settings
│   │   ├── core/            configuration, logging, error envelope
│   │   ├── database/        engine, session, Base, UTC datetime type, startup migrations
│   │   ├── models/          SQLAlchemy models and shared enums
│   │   ├── parsers/         report detection, ZAP/Nuclei parsers, normalisation, fingerprints
│   │   ├── schemas/         Pydantic request/response schemas
│   │   └── services/        business logic and SQL aggregation
│   ├── tests/               pytest suite (temporary SQLite per test)
│   ├── requirements.txt     runtime dependencies
│   ├── requirements-dev.txt test dependencies
│   └── .env.example
├── frontend/
│   └── src/
│       ├── components/      ui/, layout/, states/, projects/, dashboard/, charts/
│       ├── layouts/         AppLayout (sidebar + top bar)
│       ├── pages/           one component per route
│       ├── services/        Axios client + API modules
│       ├── hooks/           data loading helpers
│       ├── types/           API types
│       ├── utils/           constants (shared enums), routes, formatting
│       └── __tests__/       Vitest suites
├── data/                    SQLite DB and uploaded reports (runtime, git-ignored)
├── exports/                 generated exports (runtime, git-ignored)
├── sample-reports/          real scanner outputs used as test fixtures (not app data)
├── phase-prompts/           development phase specifications
├── Dockerfile, docker-compose.yml
└── CLAUDE.md                project rules
```

## Database

SQLite tables are created automatically on first start. `data/`, `data/uploads/` and `exports/` are created if they are missing.

### `projects`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | VARCHAR(200) | required, unique (case-insensitive check in the service layer) |
| application_name | VARCHAR(200) | optional |
| description | TEXT | optional |
| environment | VARCHAR(20) | `Production`, `Staging`, `UAT`, `Development`, `Other`, or NULL |
| application_url | VARCHAR(2048) | optional, must be `http(s)://` |
| owner | VARCHAR(200) | optional free text (person or team) |
| status | VARCHAR(20) | `Active` (default), `On Hold`, `Archived` |
| created_at / updated_at | DATETIME | stored as UTC |

Indexes: unique index on `name`, plus `ix_projects_status` and `ix_projects_created_at`.

### Schema upgrades

`backend/app/database/migrations.py` holds small, idempotent upgrade steps that run on every start, after `create_all`. They also create indexes that were added to existing tables.

- **Example:** a Phase 2 database stored `findings.assigned_to` as free text; it is converted to a reference to `users.id`.
- **Safety:** a step refuses to run, rather than discard data, if the old column contains values.

### `scans`

There is one row per uploaded report. Failed uploads are recorded too.

Columns: `project_id`, `scan_name`, `scanner`, `report_type`, `original_filename`, `stored_file_path` (relative to `UPLOAD_DIRECTORY`, never returned by the API), `file_hash` (SHA-256), `scan_date` (from the report, else the date entered on upload, else NULL), `uploaded_at`, `processing_status` (`Completed`/`Failed`), `processing_error`, `total_findings`, and `critical_count` … `informational_count`.

The severity counts cover the distinct findings seen in that scan.

### `findings`

There is one row per vulnerability per project, identified by `finding_key`.

- **Columns:** the fields listed in `CLAUDE.md`, plus `source_metadata` (JSON) for scanner-specific values that have no column, such as ZAP confidence and WASC id, or Nuclei matcher name, type and tags.
- **Unique constraint:** `(project_id, finding_key)`.
- **Indexes:** project, scan, severity, status, finding_key, source_tool, endpoint.
- **Immutable content:** content fields come from the report that first introduced the finding and are never overwritten.
- **Missing values:** a value absent from the report is stored as NULL, never guessed.
- **Severity:** `original_severity` keeps the report's own label. `normalized_severity` holds the standard level, or NULL when the label does not map (for example Nuclei `unknown`). NULL severities are reported as *Unclassified*.

### `finding_occurrences`

There is one row per finding per report record. Each row stores the observation verbatim: title, severity, URL, parameter, method, evidence, and `raw_record`, the complete original alert/instance or Nuclei result as JSON.

### `users`

Columns: `name`, `email` (unique, case-insensitive), `role` (`Admin` / `Security Analyst` / `Viewer`), `active` and `created_at`.

- **Purpose:** used for assignment and to attribute changes.
- **Roles:** stored now; enforced when authentication arrives in Phase 6.
- **No deletion:** users are deactivated, never deleted, so history keeps its references.

### `finding_status_history`

Columns: `finding_id`, `old_status`, `new_status`, `changed_by` (user, or NULL for *System*), `changed_at` and `comment`.

The first entry of every finding is its detection (`old_status` is NULL; the comment names the scan).

### `audit_logs`

Columns: `user_id`, `action`, `entity_type`, `entity_id`, `details` (JSON) and `timestamp`.

- **Recorded actions:** `project.created/updated/deleted`, `report.uploaded/failed`, `finding.status_changed`, `finding.assigned`, `findings.bulk_updated`, `user.created/updated`.
- **Atomic:** each entry is written in the same transaction as the change.
- **No secrets:** credentials and secrets are never logged.

### `potential_duplicates`

This table holds pairs of findings that may describe the same issue. They are never merged automatically; `decision` starts as `Pending`.

### Finding identity (fingerprint)

`finding_key = SHA-256(project | source tool | check identity | endpoint | parameter | method)`

| Input | Meaning |
|---|---|
| check identity | ZAP: `pluginid:alert name`, because the HTML report has no alertRef. Nuclei: `template-id[:matcher-name]`. |
| endpoint | `scheme://host:port/path` with the query and fragment removed. |
| method | Used for ZAP only. Nuclei's method is inferred from the raw request and is not part of identity. |

Title wording alone is never used for identity. The same scan therefore produces identical keys in every export format: ZAP JSON = XML = HTML, and Nuclei JSON = JSONL = TXT.

### Potential-duplicate rule

A pair is flagged only when all of these hold:
- The findings come from **different tools**. Within one scanner, its own check identity is trusted.
- They have the same endpoint.
- Parameter and method do not conflict. A value only conflicts when both reports provide it and the values differ.
- Every key word of one title appears in the other, with at least two key words.

A shared CWE raises confidence from Low to Medium. A shared CWE alone is not enough, because CWE-693, for example, covers many unrelated header checks.

## Installation and local run (Windows)

Prerequisites: Python 3.11+ and Node.js 20+.

**Backend** (terminal 1):

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements-dev.txt     # or requirements.txt for runtime only
uvicorn app.main:app --reload
```

**Frontend** (terminal 2):

```powershell
cd frontend
npm install
npm run dev
```

| URL | Purpose |
|---|---|
| http://localhost:5173 | Application (dev) |
| http://localhost:8000/docs | Interactive API docs |
| http://localhost:8000/api/health | Health check |

On macOS or Linux, activate the virtual environment with `source venv/bin/activate`.

## Configuration

Settings come from environment variables, or from a `.env` file in the repository root or in `backend/`. Copy `backend/.env.example` to create one.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./data/vapt.db` | SQLite database URL |
| `UPLOAD_DIRECTORY` | `./data/uploads` | Original uploaded reports |
| `EXPORT_DIRECTORY` | `./exports` | Generated exports |
| `MAX_UPLOAD_SIZE_MB` | `50` | Upload size limit (enforced when upload arrives) |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated allowed origins |
| `LOG_LEVEL` | `INFO` | Python log level |

**Relative paths are resolved against the repository root**, not against the current directory. Starting the backend from `backend/` therefore still uses `<repo>/data/vapt.db`.

## Docker

```powershell
docker compose up --build
```

This opens the application at http://localhost:8000. The SQLite database and uploaded reports persist in `./data` on the host, and exports persist in `./exports`.

## API

All endpoints are under `/api`, and the full OpenAPI documentation is at `/docs`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Liveness and database check |
| GET | `/api/projects` | List projects. Query: `page`, `page_size` (≤100), `search`, `status`, `environment`, `sort_by` (`name`, `status`, `environment`, `created_at`, `updated_at`), `sort_order` (`asc`/`desc`) |
| POST | `/api/projects` | Create a project |
| GET | `/api/projects/{id}` | Get a project |
| PUT | `/api/projects/{id}` | Update a project (only the fields sent are changed) |
| DELETE | `/api/projects/{id}` | Delete a project. Returns 409 if the project has uploaded reports; archive it instead. |
| POST | `/api/scans/upload` | Upload a report (multipart: `project_id`, `file`, optional `scan_name`, `scan_date` (YYYY-MM-DD), `allow_duplicate`). Returns an analysis summary. |
| GET | `/api/projects/{id}/scans` | A project's scans, newest first (paginated) |
| GET | `/api/scans` | All scans, newest **scan date** first (the upload time is used when the report has no date). Query: `project_id`*, `scanner`*, `status`*, `date_from`, `date_to`, `sort_by` (`scan_time`, `uploaded_at`, `name`, `total_findings`), `sort_order`, `page`, `page_size`. |
| GET | `/api/scans/{id}` | Scan detail, including `previous_scan` / `next_scan` (completed scans of the same project) |
| GET | `/api/scans/{id}/original` | The original uploaded file. Always sent as an attachment (`application/octet-stream`, `nosniff`), never rendered. |
| GET | `/api/scans/compare?base_scan_id=&compare_scan_id=` | Fingerprint comparison of two completed scans of one project (see below) |
| GET | `/api/findings` | Findings, paginated, sorted and filtered on the server. Query: `search`, `project_id`*, `severity`* (incl. `Unclassified`), `status`*, `source_tool`*, `category`*, `assignee` (user id or `unassigned`), `date_field` (`first_detected`/`last_detected`), `date_from`, `date_to`, `sort_by` (`severity`, `title`, `status`, `source`, `endpoint`, `project`, `first_detected`, `last_detected`, `updated_at`), `sort_order`, `page`, `page_size` (≤100). *Repeat a key for several values. |
| GET | `/api/findings/facets` | Distinct source tools and categories, for filter options |
| GET | `/api/findings/{id}` | Detail: all report fields, observations per scan, status history, potential duplicates |
| GET | `/api/findings/{id}/occurrences/{occurrence_id}/raw` | The complete original record from the report |
| PUT | `/api/findings/{id}` | Workflow change: `status`, `assigned_to` (user id or null) and `comment`. Report content cannot be edited (other fields → 422). Requires `X-Acting-User`. |
| POST | `/api/findings/bulk-update` | `finding_ids` (≤500) plus `status` and/or `assigned_to` and `comment`. All-or-nothing: an unknown id returns 404 and changes nothing. Requires `X-Acting-User`. |
| GET / POST | `/api/users` | List users (`include_inactive`) / create a user |
| PUT | `/api/users/{id}` | Update name, email, role, or `active` |
| GET | `/api/dashboard/severity` | Severity counts (`project_id`, `active_only`) |
| GET | `/api/dashboard/projects` | Findings per project by severity (top `limit`) |
| GET | `/api/dashboard/trends` | Findings discovered (by first detection) and resolved/closed (from status history) per day, or per month when the data spans more than 92 days (`project_id`) |
| GET | `/api/dashboard/summary` | Project, scan and finding counts, findings by severity, recent scans and recent projects |
| GET | `/api/settings` | Read-only configuration summary |

### Scan comparison

Comparison takes an older **baseline** scan A and a newer **current** scan B of the same project. Scans are ordered by scan date and swapped automatically if needed. Findings are matched by fingerprint, never by title alone.

| Result | Rule |
|---|---|
| New | In B, not in A, and in no scan before A |
| Reopened | In B, not in A, but in a scan before A (the scan that last saw it is returned) |
| Resolved | In A, not in B |
| Persistent | In both A and B |

- **Title changes:** a finding only in A and a finding only in B that share tool, check id (plugin/template) and location, and differ only in report title, are reported as one *Persistent* item ("title changed from … to …"). A renamed check is therefore never called resolved. The two finding records are not merged.
- **No automatic status changes:** comparison never changes a finding's status. It adds an `attention` note when a status disagrees with the scans, for example "Marked Resolved, but detected in …" or "Not detected in …; status is still Open".
- **Warnings:** given when the two scans come from different tools, when they were swapped, or when either scan contains no findings.
- **Audit:** each comparison is recorded as `scans.compared`.

### Acting user (until authentication exists)

Choose a user under **Settings → Users**, then pick them in the **Acting as** selector in the top bar.

- **How it works:** the UI sends the choice as the `X-Acting-User` header. Status changes, assignments and audit entries record that user.
- **Required:** finding updates are rejected (`400 acting_user_required`) without it.
- **Not authentication:** the value is self-declared. Real sign-in and role enforcement replace it in Phase 6.

Paginated responses use this shape: `{"items": [...], "total": n, "page": n, "page_size": n}`.

Errors use this shape: `{"error": {"code": "...", "message": "...", "details": ...}}`. Stack traces and internal paths are never returned.

Upload error codes:

| HTTP | Code | When | Stored? |
|---|---|---|---|
| 400 | `invalid_upload` | Empty file, or a file name with path separators, a drive letter, `..` or control characters | Nothing |
| 413 | `file_too_large` | Larger than `MAX_UPLOAD_SIZE_MB` | Nothing |
| 415 | `unsupported_media_type` | Extension not allowed, content type mismatch, or binary/executable content | Nothing |
| 409 | `duplicate_upload` | Identical bytes were already uploaded to this project. `details.existing_scan` is returned; resend with `allow_duplicate=true` to continue. | Nothing |
| 422 | `parse_error` / `unsupported_report` | Malformed JSON, JSONL or XML; XML containing DTD or entities; a bad line; or a file that is not a ZAP/Nuclei report | Original file plus a `Failed` scan (`details.scan_id`). No findings. |
| 500 | `processing_failed` | Database error while saving | The transaction is rolled back and the scan is marked `Failed` |

## Supported reports

| Scanner | Formats | Notes |
|---|---|---|
| OWASP ZAP | JSON, XML, HTML (the "traditional" reports, e.g. from `zap-baseline.py -J/-x/-r`) | One finding per alert instance. HTML has no confidence or alertRef, so those stay empty. An HTML report must contain its "Summary of Alerts" table, and the alert tables must match it per risk level. A truncated report is rejected rather than imported as a clean scan. XML is parsed with `defusedxml`; DTDs and entities are rejected. |
| Nuclei | JSON (`-je`), JSONL (`-jsonl`/`-jle`, also accepted as `.json`), TXT (`-o`) | Text output has no description, references, CWE or timestamps; the upload summary says so. |

Excel, CSV, PDF and generic JSON are planned for Phase 5.

Original files are stored at `data/uploads/<project-id>/<YYYY-MM-DD>/<uuid>_<safe-name>` and are never modified or executed. Uploaded HTML is parsed as data only.

### Adding a scanner

1. Create `backend/app/parsers/<tool>.py` with a subclass of `BaseReportParser` (`parsers/base.py`). Set `scanner`, `report_type` and `extensions`.
2. Implement the three methods:
   - `can_parse(file)` — a cheap structural check that never raises.
   - `parse(file)` — returns the raw records exactly as they appear in the report.
   - `normalize(record)` — returns a `NormalizedFinding`. Copy only values that are present, and set `identity` to the tool's stable check id.
3. Register an instance in `PARSERS` in `parsers/registry.py`. Add the scanner to the `Scanner` enum, and add the extension to `ALLOWED_EXTENSIONS` if it is new.
4. Add a real report to `sample-reports/` and tests to `backend/tests/test_parsers.py`.

No dashboard or database change is needed.

## Testing

```powershell
# Backend
cd backend
venv\Scripts\python -m pytest

# Frontend
cd frontend
npm test          # Vitest
npm run build     # type-check + production build
```

## Troubleshooting

| Problem | Fix |
|---|---|
| Frontend shows "Unable to reach the server" | Start the backend on port 8000, or set `VITE_API_PROXY_TARGET` before `npm run dev`. |
| CORS errors when the frontend is served from another origin | Add the origin to `CORS_ORIGINS`. |
| Need a clean database | Stop the backend and delete `data/vapt.db` (and `data/uploads/`). It is recreated on the next start. |
| Upload rejected as "not recognised" | Only the formats listed under *Supported reports* are accepted. For ZAP, use the traditional JSON/XML/HTML reports. |
| Port already in use | `uvicorn app.main:app --reload --port 8001`, and set `VITE_API_PROXY_TARGET=http://localhost:8001`. |
| Docker container restarts with `PermissionError: ... /app/data/uploads` | The `./data` bind mount is not writable. On **Docker Desktop for Windows**, the drive holding the repository must be shared with Docker (Settings → Resources → File sharing). Otherwise the mount appears as an empty, root-owned directory. On **Linux**, the container runs as UID 1000; run `sudo chown -R 1000:1000 data exports`. |

## Roadmap

1. Foundation (done)
2. Upload pipeline and ZAP/Nuclei parsers (done)
3. Findings management (done)
4. Scan history, comparison and full dashboard (done)
5. PDF/Excel/CSV parsers, exports and bulk upload
6. Authentication, RBAC and audit
7. Remediation library, polish and hardening

See `phase-prompts/` for details.
