# VAPT Management Dashboard

A lightweight, local-first web application that QA and security teams use to manage projects and their VAPT (Vulnerability Assessment and Penetration Testing) reports.

Uploaded reports are the source of truth. The application never invents findings, evidence or scores.

> **Status: Phase 1 (Foundation).** Projects, the application shell, a dashboard built from real SQLite data, and Docker support are in place.
> Report upload, parsing, findings, scans and exports are **not implemented yet**. Those screens show explicit empty states. See [Roadmap](#roadmap).

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
│   │   ├── api/             routers: health, projects, dashboard, settings
│   │   ├── core/            configuration, logging, error envelope
│   │   ├── database/        engine, session, Base, UTC datetime type
│   │   ├── models/          SQLAlchemy models and shared enums
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
| DELETE | `/api/projects/{id}` | Delete a project |
| GET | `/api/dashboard/summary` | Project count, counts by status and environment, and recent projects |
| GET | `/api/settings` | Read-only configuration summary |

Paginated responses use this shape: `{"items": [...], "total": n, "page": n, "page_size": n}`.

Errors use this shape: `{"error": {"code": "...", "message": "...", "details": [...]}}`. Stack traces and internal paths are never returned.

## Supported reports

Report ingestion is not available yet. It is planned as follows:

- OWASP ZAP (HTML, JSON, XML) and Nuclei (JSON, JSONL, TXT) in Phase 2.
- Excel, CSV, PDF and generic JSON in Phase 5.

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
| Need a clean database | Stop the backend and delete `data/vapt.db`. It is recreated on the next start. |
| Port already in use | `uvicorn app.main:app --reload --port 8001`, and set `VITE_API_PROXY_TARGET=http://localhost:8001`. |
| Docker container restarts with `PermissionError: ... /app/data/uploads` | The `./data` bind mount is not writable. On **Docker Desktop for Windows**, the drive holding the repository must be shared with Docker (Settings → Resources → File sharing). Otherwise the mount appears as an empty, root-owned directory. On **Linux**, the container runs as UID 1000; run `sudo chown -R 1000:1000 data exports`. |

## Roadmap

1. Foundation (done)
2. Upload pipeline and ZAP/Nuclei parsers
3. Findings management
4. Scan history, comparison and full dashboard
5. PDF/Excel/CSV parsers, exports and bulk upload
6. Authentication, RBAC and audit
7. Remediation library, polish and hardening

See `phase-prompts/` for details.
