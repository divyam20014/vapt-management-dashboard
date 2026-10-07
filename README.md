# VAPT Management Dashboard

A lightweight, local-first web application that QA and security teams use to manage projects and their VAPT (Vulnerability Assessment and Penetration Testing) reports.

Uploaded reports are the source of truth. The application never invents findings, evidence or scores.

> **Status: version 1.0 (all seven phases complete).** The application covers:
> - **Imports:** ZAP, Nuclei, PDF, Excel, CSV and generic JSON reports, including bulk upload.
> - **Findings management:** search, filters, status, assignment and history.
> - **Scans:** history, and fingerprint-based comparison.
> - **Dashboards:** every figure is calculated from SQLite.
> - **Exports:** findings as CSV, Excel or JSON, and a project report.
> - **Access:** local sign-in with three roles (Admin, Security Analyst, Viewer), and an audit log.
> - **Remediation library:** standard guidance shown alongside the report's own recommendation, never replacing it.
>
> See [Limitations](#limitations) for what V1 does not do.

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
- **Parsers:** `backend/app/parsers/` holds one parser per format behind a common interface (`can_parse`, `parse`, `normalize`). The registry tries them in order (see *Adding a scanner*).
- **Remediation library:** guidance records live in code (`backend/app/remediation/library.py`), are synchronised into SQLite on start-up, and are linked to findings when they are read.
- **Request pipeline:**
  - Middleware adds security headers, checks the CSRF header, and screens upload requests before their body is read.
  - Routers check the session and permissions.
  - Services hold the business logic and transactions.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Axios, Recharts, Lucide React |
| Backend | Python 3.11+, FastAPI, Pydantic v2, pydantic-settings, SQLAlchemy 2, openpyxl (XLSX read/write), pdfplumber (PDF text and tables, MIT licence) |
| Database | SQLite (`data/vapt.db`) |
| Tests | pytest + FastAPI TestClient; Vitest + React Testing Library |

## Folder structure

```text
├── backend/
│   ├── app/
│   │   ├── main.py          app factory, CORS, error handlers, SPA serving
│   │   ├── api/             routers: health, auth, projects, scans, findings, exports, users, dashboard, settings, audit; deps.py checks sign-in and permissions
│   │   ├── core/            configuration, logging, error envelope, password hashing, role permissions
│   │   ├── database/        engine, session, Base, UTC datetime type, startup migrations
│   │   ├── models/          SQLAlchemy models and shared enums
│   │   ├── parsers/         report detection, parsers per format, normalisation, fingerprints
│   │   ├── remediation/     built-in standard remediation guidance (library.py)
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

Columns: `name`, `email` (unique, case-insensitive), `role` (`Admin` / `Security Analyst` / `Viewer`), `active`, `created_at`, `password_hash` and `last_login_at`.

- **Purpose:** sign-in, assignment, and attributing changes.
- **Passwords:** only a salted scrypt hash is stored. A user with no password can be assigned findings but cannot sign in.
- **No deletion:** users are deactivated, never deleted, so history keeps its references. Deactivating a user signs them out everywhere.

### `user_sessions`

Columns: `user_id`, `token_hash`, `created_at`, `last_seen_at` and `expires_at`. One row per signed-in browser. Only the SHA-256 digest of the session token is stored.

### `finding_status_history`

Columns: `finding_id`, `old_status`, `new_status`, `changed_by` (user, or NULL for *System*), `changed_at` and `comment`.

The first entry of every finding is its detection (`old_status` is NULL; the comment names the scan).

### `audit_logs`

Columns: `user_id`, `action`, `entity_type`, `entity_id`, `project_id`, `finding_id`, `details` (JSON) and `timestamp`.

- **Recorded actions:**
  - projects: `project.created`, `project.updated`, `project.deleted`;
  - uploads: `report.uploaded`, `report.failed`, `reports.bulk_uploaded`, and `report.duplicate_accepted` (an identical file uploaded again after the warning);
  - findings: `finding.status_changed`, `finding.assigned`, `findings.bulk_updated`, and `duplicate.decided` (a potential duplicate kept separate, or returned to pending);
  - other: `scans.compared`, `report.exported`;
  - users: `user.created`, `user.updated`, `user.password_set`;
  - sign-in: `auth.setup_completed`, `auth.login`, `auth.login_failed`, `auth.logout`, `auth.password_changed`.
- **Project and finding:** `project_id` and `finding_id` are plain integers rather than foreign keys, so entries outlive deleted records. On upgrade, existing entries are filled in from their stored references only.
- **Atomic:** each entry is written in the same transaction as the change.
- **No secrets:** passwords, password hashes and session tokens are never written to the audit log or the application log. For a failed sign-in the attempted email is not stored either, because people sometimes type a password into that field.

### `potential_duplicates`

This table holds pairs of findings that may describe the same issue. They are never merged automatically; `decision` starts as `Pending`. A Security Analyst or Admin can mark a pair *Kept Separate* (or undo that); each decision is audited.

### `remediation_guidelines`

Standard remediation guidance. Each record has:
- `title`, `category` and an OWASP Top 10 reference;
- `summary`, `steps`, `verification` and `references`;
- exact matching rules: `zap_rules` (ZAP alert IDs), `nuclei_rules` (template ID, or template plus matcher) and `cwe_ids`.

The built-in records are synchronised from `backend/app/remediation/library.py` on every start, so editing that file and restarting updates the library. See [Remediation library](#remediation-library).

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
| `SESSION_IDLE_MINUTES` | `480` | A session ends after this much inactivity |
| `SESSION_MAX_HOURS` | `24` | A session always ends after this long |
| `SESSION_COOKIE_SECURE` | `false` | Set to `true` when served over HTTPS |
| `SQLITE_WAL` | `true` | SQLite write-ahead logging, so pages keep reading while a large upload is saved. Set to `false` on network shares and Docker Desktop bind mounts (the compose file does). |
| `SQLITE_BUSY_TIMEOUT_SECONDS` | `30` | How long a request waits for another writer before failing |

**Relative paths are resolved against the repository root**, not against the current directory. Starting the backend from `backend/` therefore still uses `<repo>/data/vapt.db`.

## Docker

```powershell
docker compose up --build
```

This opens the application at http://localhost:8000. The SQLite database and uploaded reports persist in `./data` on the host, and exports persist in `./exports`.

- **Local only by default.** The port is published on `127.0.0.1` only, because the first person to open a fresh installation creates the Admin account. After setup, change the mapping in `docker-compose.yml` to `"8000:8000"` if other machines need access, and put HTTPS in front of the application (with `SESSION_COOKIE_SECURE=true`).
- **WAL off.** The compose file sets `SQLITE_WAL=false`, because Docker Desktop bind mounts do not support SQLite's shared-memory files reliably.

## API

All endpoints are under `/api`, and the full OpenAPI documentation is at `/docs`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Liveness and database check (public) |
| GET | `/api/auth/status` | Public. `{"setup_required": true}` until somebody can sign in |
| POST | `/api/auth/setup` | Public, one time only: create the first Admin (`name`, `email`, `password`) and sign in. 409 once setup is complete. |
| POST | `/api/auth/login` | Public. `email`, `password`. Sets the session cookie. A failure always returns `401 invalid_credentials`. Repeated failures return `429 too_many_attempts`. |
| POST | `/api/auth/logout` | End this session |
| GET | `/api/auth/me` | The signed-in user, role and `permissions` |
| POST | `/api/auth/change-password` | `current_password`, `new_password`. Other sessions of this user are ended. |
| GET | `/api/projects` | List projects. Query: `page`, `page_size` (≤100), `search`, `status`, `environment`, `sort_by` (`name`, `status`, `environment`, `created_at`, `updated_at`), `sort_order` (`asc`/`desc`) |
| POST | `/api/projects` | Create a project |
| GET | `/api/projects/{id}` | Get a project |
| PUT | `/api/projects/{id}` | Update a project (only the fields sent are changed) |
| DELETE | `/api/projects/{id}` | Delete a project. Returns 409 if the project has uploaded reports; archive it instead. |
| POST | `/api/scans/upload` | Upload a report (multipart: `project_id`, `file`, optional `scan_name`, `scan_date` (YYYY-MM-DD), `allow_duplicate`). Returns an analysis summary. |
| GET | `/api/projects/{id}/scans` | A project's scans, newest first (paginated) |
| GET | `/api/scans` | All scans, newest **scan date** first (the upload time is used when the report has no date). Query: `project_id`*, `scanner`*, `status`*, `date_from`, `date_to`, `sort_by` (`scan_time`, `uploaded_at`, `name`, `total_findings`), `sort_order`, `page`, `page_size`. |
| GET | `/api/scans/{id}` | Scan detail, including `previous_scan` / `next_scan` (completed scans of the same project) |
| DELETE | `/api/scans/{id}` | Admin only. See *Deleting scans and findings*. Returns `findings_removed` / `findings_kept`. |
| GET | `/api/scans/{id}/original` | The original uploaded file. Always sent as an attachment (`application/octet-stream`, `nosniff`), never rendered. |
| GET | `/api/scans/compare?base_scan_id=&compare_scan_id=` | Fingerprint comparison of two completed scans of one project (see below) |
| GET | `/api/findings` | Findings, paginated, sorted and filtered on the server. Query: `search`, `project_id`*, `severity`* (incl. `Unclassified`), `status`*, `source_tool`*, `category`*, `assignee` (user id or `unassigned`), `date_field` (`first_detected`/`last_detected`), `date_from`, `date_to`, `sort_by` (`severity`, `title`, `status`, `source`, `endpoint`, `project`, `first_detected`, `last_detected`, `updated_at`), `sort_order`, `page`, `page_size` (≤100). *Repeat a key for several values. |
| GET | `/api/findings/facets` | Distinct source tools and categories, for filter options |
| GET | `/api/findings/{id}` | Detail: all report fields, observations per scan, status history, potential duplicates |
| GET | `/api/findings/{id}/occurrences/{occurrence_id}/raw` | The complete original record from the report |
| DELETE | `/api/findings/{id}` | Admin only. Removes the finding with its observations, history and duplicate suggestions. |
| GET | `/api/remediation` | The remediation library. Query: `search` (title, text, CWE, ZAP alert ID or Nuclei template), `category`. Each entry includes `findings` and `active_findings`, the stored findings it applies to. |
| GET | `/api/remediation/{slug}` | One guideline: steps, verification, references and matching rules |
| PUT | `/api/findings/{id}` | Workflow change: `status`, `assigned_to` (user id or null) and `comment`. Report content cannot be edited (other fields → 422). |
| POST | `/api/findings/bulk-update` | `finding_ids` (≤500) plus `status` and/or `assigned_to` and `comment`. All-or-nothing: an unknown id returns 404 and changes nothing. |
| PUT | `/api/findings/{id}/duplicates/{pair_id}` | `decision`: `Kept Separate` or `Pending`, plus an optional `comment`. Merging is not offered (422). |
| GET / POST | `/api/users` | List users (`include_inactive`) / create a user (optional initial `password`) |
| PUT | `/api/users/{id}` | Update name, email, role, or `active`. Refused (409) if it would leave no active Admin who can sign in, or if you deactivate or demote yourself. |
| PUT | `/api/users/{id}/password` | Set or reset a password. The user is signed out everywhere. |
| GET | `/api/audit-logs` | Newest first. Query: `user_id`, `action`*, `project_id`, `finding_id`, `date_from`, `date_to`, `page`, `page_size` (≤200). |
| GET | `/api/audit-logs/actions` | Action codes and labels, for filters |
| GET | `/api/dashboard/severity` | Severity counts (`project_id`, `active_only`) |
| GET | `/api/dashboard/projects` | Findings per project by severity (top `limit`) |
| GET | `/api/dashboard/trends` | Findings discovered (by first detection) and resolved/closed (from status history) per day, or per month when the data spans more than 92 days (`project_id`) |
| GET | `/api/dashboard/summary` | Project, scan and finding counts, findings by severity, recent scans and recent projects |
| GET | `/api/settings` | Read-only configuration summary |
| POST | `/api/scans/upload-bulk` | Bulk upload (multipart: `project_id`, `files` repeated, ≤25, optional `allow_duplicates`). Each file is processed independently. Response: one result per file (`created`, `duplicate`, `failed` with its stored `scan_id`, or `rejected`) plus `summary` (`succeeded`, `failed`, `duplicates`, `findings_added`). The UI uploads files one at a time so it can show progress, and uses the same per-file rules. |
| GET | `/api/exports/findings?format=csv\|xlsx\|json` | Every finding matching the same filters as `/api/findings` (no paging), as a download. Also saved to `EXPORT_DIRECTORY`. |
| GET | `/api/exports/projects/{id}/report` | The project report (HTML) as a download |
| GET | `/api/exports` | Exports saved in `EXPORT_DIRECTORY`, newest first |
| GET | `/api/exports/files/{name}` | Download a saved export (plain file names only) |

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

### Authentication and roles

**First run.** While nobody can sign in, the application shows **Create the first Admin**. If a user with the same email already exists (created before sign-in existed), that user becomes the Admin, so their history stays attributed to them. After that, setup is closed (409).

**Adding people.** Under **Settings → Users**, an Admin adds users, chooses a role, and sets an initial password. A user with no password can be assigned findings but cannot sign in. Users change their own password from the account menu in the top bar.

**Roles.** The server checks every request. The UI hides what a role cannot use, but that is only for clarity.

| Permission | Viewer | Security Analyst | Admin |
|---|:-:|:-:|:-:|
| View dashboards, projects, scans, findings and original reports; compare scans | ✓ | ✓ | ✓ |
| Export findings and the project report | ✓ | ✓ | ✓ |
| Create and edit projects | | ✓ | ✓ |
| Upload reports (single and bulk) | | ✓ | ✓ |
| Change status and assignment (single and bulk) | | ✓ | ✓ |
| Decide on potential duplicates | | ✓ | ✓ |
| Delete projects (without scans), scans and findings | | | ✓ |
| Manage users, roles and passwords | | | ✓ |
| Audit Log | | | ✓ |

The map lives in `backend/app/core/permissions.py`. `GET /api/auth/me` returns the signed-in user's permissions, which the UI uses.

**How it is enforced:**
- **Protected by default.** Every `/api` route requires a session, except health, auth status, setup and login. A test checks every route in the OpenAPI schema for this.
- **Permissions.** Routes that change data also check a permission. Without a session the API returns `401 not_authenticated`; with a session but the wrong role, `403 forbidden`.
- **Changes apply immediately.** Role changes take effect on the next request. Deactivating a user ends their sessions.

**Sessions:**
- **Cookie.** After sign-in the server sets `vapt_session`, an HttpOnly cookie with `SameSite=Strict` and `Path=/api`. Scripts cannot read it.
- **Expiry.** A session ends after `SESSION_IDLE_MINUTES` without activity, and always after `SESSION_MAX_HOURS`.
- **HTTPS.** Set `SESSION_COOKIE_SECURE=true` when the application is served over HTTPS.

**CSRF.** Every request that changes data must send `X-Requested-With: XMLHttpRequest`, or it gets `403 csrf_check_failed`. A form on another site cannot add that header, and a script on another origin would need a CORS preflight, which only the origins in `CORS_ORIGINS` pass. `SameSite` alone is not enough, because other ports on `localhost` count as the same site.

**Passwords:**
- **Rules.** At least 12 characters (up to 256). There are no composition rules.
- **Storage.** Salted scrypt hashes (Python standard library). No extra dependency is needed.
- **Failed sign-ins:**
  - **Same answer.** Every failure gets the same message, and an unknown account takes as long as a wrong password, so responses do not reveal which accounts exist.
  - **Rate limit.** Sign-in is limited to 5 failures per client and email, and 20 per client, within 15 minutes. The counters are held in memory, so they reset when the server restarts.

**Locked out?** On the server, from `backend/`, run `venv\Scripts\python -m app.cli reset-password <email>`. It prompts for a new password without showing it, re-activates the account, ends that user's sessions, and writes `user.password_set` to the audit log with the actor shown as System. Shell access to the server is the authorization here; anyone with it can already read the database.

Paginated responses use this shape: `{"items": [...], "total": n, "page": n, "page_size": n}`.

Errors use this shape: `{"error": {"code": "...", "message": "...", "details": ...}}`. Stack traces and internal paths are never returned.

Upload error codes:

| HTTP | Code | When | Stored? |
|---|---|---|---|
| 400 | `invalid_upload` | Empty file, or a file name with path separators, a drive letter, `..` or control characters | Nothing |
| 413 | `file_too_large` | Larger than `MAX_UPLOAD_SIZE_MB` | Nothing |
| 415 | `unsupported_media_type` | Extension not allowed, content type mismatch, or binary/executable content | Nothing |
| 409 | `duplicate_upload` | Identical bytes were already uploaded to this project. `details.existing_scan` is returned; resend with `allow_duplicate=true` to continue. | Nothing |
| 422 | `parse_error` / `unsupported_report` | Malformed JSON, JSONL, XML, CSV, XLSX or PDF; XML containing DTD or entities; an encrypted PDF; an XLSX with macros or an unsafe archive; a findings table without a title column, or a row with values but no title; or a file that is not a supported report | Original file plus a `Failed` scan (`details.scan_id`). No findings. |
| 500 | `processing_failed` | Database error while saving | The transaction is rolled back and the scan is marked `Failed` |

## Supported reports

| Scanner | Formats | Notes |
|---|---|---|
| OWASP ZAP | JSON, XML, HTML (the "traditional" reports, e.g. from `zap-baseline.py -J/-x/-r`) | One finding per alert instance. HTML has no confidence or alertRef, so those stay empty. An HTML report must contain its "Summary of Alerts" table, and the alert tables must match it per risk level. A truncated report is rejected rather than imported as a clean scan. XML is parsed with `defusedxml`; DTDs and entities are rejected. |
| Nuclei | JSON (`-je`), JSONL (`-jsonl`/`-jle`, also accepted as `.json`), TXT (`-o`) | Text output has no description, references, CWE or timestamps; the upload summary says so. |

| OWASP ZAP | PDF (the "traditional-pdf" report) | Read with the same fields and per-risk completeness check as the HTML report. Label/value rows split across a page break are rejoined. Fields the PDF does not show (for example Parameter) are stored as empty and listed as **Not Extracted** on the finding. Line breaks inside long text may come from the page layout; the upload summary warns about this. |
| Imported report | CSV, XLSX, generic JSON, PDF containing a findings table | For findings trackers and other tools' exports. See *Column mapping* below. |

### Column mapping (CSV, XLSX, generic JSON, PDF tables)

- **Matching:** column headers are matched exactly, ignoring case, spacing and punctuation, against a fixed list of names for each field. Examples: "Vulnerability", "Issue" or "Title" map to the title; "Risk Rating" or "Severity" map to severity; "Remediation" maps to the recommendation; "Proof of Concept" maps to evidence. There is no fuzzy matching.
- **Required columns:** a title column is required, plus at least one other recognised column.
- **Ambiguity:** if two columns map equally well to one field, the file is rejected.
- **Rows without a title:** a row that has values but no title rejects the whole file, naming the row.
- **Unknown columns:** values in unrecognised columns are kept in the original record (`other_columns`) and listed in the upload warnings.
- **Status:** a "Status" value is applied to a *new* finding only when it exactly matches one of the application's statuses. It is always kept as the reported value.
- **Values:** CVSS, CWE and severity are parsed only when unambiguous. Otherwise the original text is kept and the normalised field stays empty.
- **Identity:** the fingerprint uses the normalised title, the URL/endpoint, parameter and method, and the tool named in the file ("Imported report" if none is named).
- **CSV:** UTF-8 (with or without BOM); Windows-1252 is accepted with a warning. Comma, semicolon, tab and pipe delimiters are detected. Values are read as text; nothing is coerced.
- **XLSX:** the sheet with the most recognised columns is used, and a tie is rejected. A header row may sit below title rows. Formulas are read as their cached values. Files with macros, more than 5000 entries, over 200 MB uncompressed, or a compression ratio above 200 are rejected.
- **Generic JSON:** a list of objects, or an object holding exactly one list under `findings`, `vulnerabilities`, `issues`, `results` or `items`.
- **PDF tables:** tables with a findings header are grouped by header. The most complete group is used, and a tie is rejected. Repeated headers, rows split across pages and wrapped cells are handled. When the table has a row-number column, a gap in the numbering rejects the file. Scanned (image-only) PDFs are not supported, because there is no OCR.

### Exports

- **Columns:** CSV, XLSX and JSON exports contain the stored values only, including original title and severity, observation count and fingerprint. The column names re-import through the CSV/XLSX importer.
- **Formulas:** CSV cells that begin with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with `'`, so a spreadsheet does not run them. XLSX cells are always written as text.
- **Project report:** a self-contained HTML page with these sections:
  - project information, executive summary and risk summary;
  - severity distribution;
  - findings grouped as Critical, High, Medium and Low;
  - detailed findings;
  - remediation summary;
  - scan information.

  Every number comes from SQLite. Fields with no value are shown as "Not in report". Use the browser's *Print → Save as PDF* to produce a PDF.
- **Audit:** each export is written to the audit log as `report.exported`. A bulk upload is logged as `reports.bulk_uploaded`.

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

## Remediation library

**What it is.** The **Remediation Library** page lists standard guidance (security headers, injection, transport security, information disclosure and others), with search and a category filter. Each guideline shows:
- its steps and how to verify the fix;
- OWASP and CWE references;
- the exact rules that link it to findings;
- how many stored findings it applies to, linking to that filtered findings list.

**How a finding is linked:**
1. **By scanner rule.** A guideline lists the finding's own check identifier: a ZAP alert ID (for example 10038) or a Nuclei template, with its matcher for multi-matcher templates such as `http-missing-security-headers:content-security-policy`.
2. **By CWE.** Used only if no scanner rule matched, and only for specific CWEs, each of which belongs to one guideline. Broad CWEs that cover many unrelated issues are never used: CWE-16, CWE-200, CWE-264 and CWE-693. The finding page marks a CWE match "Check that the guidance fits this finding".
3. **Otherwise none.** Titles are never compared. A finding with no exact rule shows no standard guidance.

**What it never does:**
- It never changes a finding.
- The report's text is always shown as **Original recommendation (from the scanner report)**, in a separate block from **Standard remediation guidance**.
- In the project report, the remediation summary has a separate, labelled *Standard remediation guidance* table, with active and total findings per guideline.

**Adding or changing guidance:**
- Edit `backend/app/remediation/library.py` and restart.
- Add ZAP alert IDs only after checking them against https://www.zaproxy.org/docs/alerts/.
- `tests/test_remediation.py` fails if a rule or CWE is listed by two guidelines, if a broad CWE is used, or if a guideline lacks steps, verification or HTTPS references.

## Deleting scans and findings

Admins can delete a scan (Scan detail → *Delete scan*) or a finding (Finding detail → *Delete finding*). Parsing never deletes anything.

**Deleting a scan:**
- Its observations are removed.
- Findings that no other scan observed are removed, with their history and duplicate suggestions.
- Findings also seen in other scans keep their status and history. Their first/last detection dates and originating scan are recalculated from the remaining scans.
- The stored original file is deleted after the database change commits; a failure deletes nothing.
- The audit entry keeps the file name and SHA-256 hash.

**Deleting a finding** removes its observations, history and duplicate suggestions. Scan totals are left as they are, because they record what each report contained.

## Security and robustness

- **Uploads:**
  - Each file is checked for extension, MIME type, size, file name (no path parts or control characters) and content signature. Executables, macros, XML entities, zip bombs and encrypted PDFs are rejected.
  - Files are stored under generated names and never executed.
  - Upload requests from people who are not signed in, or whose role cannot upload, are refused before the body is read. Bodies over the size limit are cut off while streaming (413).
- **Authorization:** checked on the server for every route (see *Authentication and roles*). Sessions are HttpOnly, SameSite=Strict cookies; changes require the `X-Requested-With` header.
- **Response headers:**
  - every response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy`;
  - API responses: `Cache-Control: no-store`;
  - the built UI: a Content Security Policy (scripts from the same origin only);
  - original reports: always downloaded as attachments, with a sandbox CSP.
- **Untrusted content:**
  - Report text is shown as text, never as HTML.
  - Reference links are rendered only for `http(s)` URLs.
  - The HTML project report escapes every value and has a CSP that blocks scripts.
  - CSV and XLSX exports neutralise spreadsheet formulas.
- **Transactions:**
  - An upload is saved in one transaction. A failure (database or otherwise) rolls everything back, records a *Failed* scan and keeps the original file.
  - Bulk status updates are all-or-nothing.
  - A file that previously failed to process can be uploaded again; only completed scans count as duplicates.
- **Large reports:**
  - Findings, observations and history are written with batched inserts. A 3,000-finding upload takes about 30 SQL statements; a 20,000-finding report saves in about 20 seconds.
  - Lists are paginated on the server. The comparison and the remediation filter avoid SQLite's bound-parameter limit by chunking.
  - XLSX exports stream rows.
- **Original evidence:**
  - Every report record is stored verbatim as an observation (`raw_record`), and evidence is never trimmed or rewritten.
  - The original file is kept unchanged until an Admin deletes its scan.
- **Logging:** uploads, parser selection, results, duplicates, sign-ins and errors are logged. Passwords, password hashes, session tokens and report contents are never logged.

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

**Backend (pytest):**
- every parser, run against real fixtures in `sample-reports/`;
- uploads and upload security, duplicates, findings workflow and bulk updates;
- comparison, dashboards and exports;
- authentication and each role against protected actions;
- audit events, deletion, the remediation library and hardening.

**Frontend (Vitest and Testing Library):**
- dashboard, projects, upload, findings filters, details and status updates, bulk update and navigation;
- sign-in and roles, the audit log, the remediation library and deletion.

## Troubleshooting

| Problem | Fix |
|---|---|
| Frontend shows "Unable to reach the server" | Start the backend on port 8000, or set `VITE_API_PROXY_TARGET` before `npm run dev`. |
| CORS errors when the frontend is served from another origin | Add the origin to `CORS_ORIGINS`. |
| Need a clean database | Stop the backend and delete `data/vapt.db` (and `data/uploads/`). It is recreated on the next start. |
| Upload rejected as "not recognised" | Only the formats listed under *Supported reports* are accepted. For ZAP, use the traditional JSON/XML/HTML/PDF reports. For a tracker, check that it has a recognised title column (see *Column mapping*). |
| Forgot the only Admin password | On the server: `cd backend` then `venv\Scripts\python -m app.cli reset-password <email>` (see *Authentication and roles*). |
| `403 csrf_check_failed` from a script or tool | Send the header `X-Requested-With: XMLHttpRequest` on POST/PUT/DELETE. |
| After upgrading, the app asks to create the first Admin | Users from earlier versions have no password. Use the email of an existing user to keep their history, then set passwords for the others under **Settings → Users**. |
| `database is locked` errors on a network drive | Set `SQLITE_WAL=false`, and keep `data/` on a local disk if possible. |
| A finding shows no standard guidance | No guideline matches its scanner rule or a specific CWE. This is intentional (no guessing). Search the Remediation Library manually. |
| Port already in use | `uvicorn app.main:app --reload --port 8001`, and set `VITE_API_PROXY_TARGET=http://localhost:8001`. |
| Docker container restarts with `PermissionError: ... /app/data/uploads` | The `./data` bind mount is not writable. On **Docker Desktop for Windows**, the drive holding the repository must be shared with Docker (Settings → Resources → File sharing). Otherwise the mount appears as an empty, root-owned directory. On **Linux**, the container runs as UID 1000; run `sudo chown -R 1000:1000 data exports`. |

## Roadmap

1. Foundation (done)
2. Upload pipeline and ZAP/Nuclei parsers (done)
3. Findings management (done)
4. Scan history, comparison and full dashboard (done)
5. PDF/Excel/CSV parsers, exports and bulk upload (done)
6. Authentication, RBAC and audit (done)
7. Remediation library, polish and hardening (done)

## Limitations

- **Local sign-in only:** no single sign-on, multi-factor authentication or password reset by email. Admins reset passwords, and `python -m app.cli reset-password` recovers a locked-out Admin.
- **Duplicates are suggested, never merged:** a pair can be kept separate; merging is not offered.
- **PDF import:**
  - It reads text and tables only; there is no OCR for scanned PDFs.
  - A table with no row-number column can still lose a row that falls across a page break without the import noticing.
  - Long text may contain line breaks from the page layout.
- **Tracker imports:** findings from a tracker spreadsheet are identified by title, so they do not match native ZAP/Nuclei findings of the same issue.
- **Resource use:** a single 50 MB upload is parsed in memory (hundreds of MB of RAM for large HTML or PDF reports). Exports and the project report are built from all matching findings at once.
- **Scale:** comparisons return every item (filterable in the UI). Selectors list up to 2,000 projects.
- **Scan comparison and exports write audit entries,** so viewing a comparison is recorded each time.
- **Sign-in limits reset on restart:** the rate limit on failed sign-ins is held in memory.
- **Remediation library is edited in code,** not in the UI.
- **No scanning:** the application manages uploaded reports only; it does not run scanners, and it uses no AI.

See `phase-prompts/` for details.
