# CLAUDE.md — VAPT Management Dashboard

## 1. Mission

Build a lightweight, professional, fully functional VAPT Management Dashboard for QA/Security teams.

The product manages multiple projects/applications and their VAPT reports. Version 1 is report-management focused:

**Create Project → Upload Report → Detect → Parse → Normalize → Validate → Deduplicate/Flag → Store → Dashboard → Track Remediation → Compare Scans → Export**

This is a real application, not a static UI mockup.

The original requirements are represented by this repository's phase prompts and the source requirements supplied by the user. Do not invent security findings or fabricate evidence.

---

## 2. Non-Negotiable Rules

### Source-of-truth rule
Uploaded VAPT reports are the source of truth for vulnerability content.

Never:
- invent findings;
- invent evidence;
- invent endpoints;
- invent reproduction steps;
- invent CWE/CVSS/OWASP values;
- silently fill missing security information from assumptions;
- modify original scanner evidence.

If a value is absent or cannot be confidently extracted, preserve it as empty/`Not Provided`/`Not Extracted` as appropriate.

AI is NOT required for V1.

### Original-vs-normalized data
Always preserve original scanner values separately from application-generated normalized values where normalization occurs.

Examples:
- `original_title` / `normalized_title`
- `original_severity` / `normalized_severity`

Original evidence must remain unchanged.

### Real-data rule
Final application screens and dashboard calculations must use actual SQLite data.

Do not use mock/dummy data in the normal application.

Demo/seed data is allowed only when explicitly triggered.

### Incremental-development rule
Implement one phase at a time.

After each phase:
1. Run backend tests.
2. Run frontend tests/build.
3. Start the application when practical.
4. Exercise relevant APIs.
5. Verify database changes.
6. Verify important UI workflows.
7. Fix failures.
8. Report what is implemented and what is verified.
9. Do not silently mark unverified work as complete.

Do not proceed to the next phase until the current phase is stable unless explicitly instructed.

---

## 3. Technology Stack

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- Recharts
- Lucide React
- React Router
- Axios

### Backend
- Python
- FastAPI
- Pydantic
- SQLAlchemy
- SQLite

### File processing
- PDF: PyMuPDF and/or pdfplumber
- Excel: openpyxl and/or pandas
- CSV: pandas
- JSON: Python JSON
- HTML: BeautifulSoup where required

### Storage
SQLite database:
`data/vapt.db`

Uploaded original reports:
`data/uploads/`

Exports:
`exports/`

Do not require MySQL, PostgreSQL, MongoDB, Redis, Kafka, Elasticsearch, Kubernetes, microservices, cloud infrastructure, or an AI API for V1.

Docker support must be provided, but local Windows development must remain easy.

---

## 4. Architecture

Use a clean layered architecture:

```text
React / TypeScript
        |
      REST
        |
FastAPI API layer
        |
Service layer
        |
Parser / normalization layer
        |
SQLAlchemy data layer
        |
SQLite + local file storage
```

Parser architecture must be scanner-independent:

```text
ZAP --------\
Nuclei ------\
PDF ----------> Parser -> Normalized Finding -> Validation -> Storage
Excel -------/
CSV --------/
JSON -------/
```

Use a common parser interface similar to:

```python
class BaseReportParser:
    def can_parse(self, file): ...
    def parse(self, file): ...
    def normalize(self, data): ...
```

Adding a future scanner should not require redesigning the dashboard or database.

---

## 5. Repository Structure

Prefer:

```text
vapt-dashboard/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── types/
│   │   └── utils/
│   ├── package.json
│   └── vite.config.ts
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── parsers/
│   │   ├── database/
│   │   └── utils/
│   ├── requirements.txt
│   └── .env.example
│
├── data/
│   ├── vapt.db
│   └── uploads/
├── exports/
├── tests/
├── sample-reports/          # test fixtures only; do not expose as app data
├── phase-prompts/
├── docker-compose.yml
├── Dockerfile
├── README.md
├── .gitignore
└── CLAUDE.md
```

Keep modules cohesive. Avoid unnecessary abstractions.

---

## 6. Core Data Model

At minimum support these concepts:

### Project
- id
- name
- application_name
- description
- environment
- application_url
- owner
- status
- created_at
- updated_at

### Scan
- id
- project_id
- scan_name
- scanner
- report_type
- original file name
- stored file path
- scan_date
- uploaded_at
- processing status
- total findings
- critical count
- high count
- medium count
- low count
- informational count
- processing error

### Finding
- id
- project_id
- scan_id
- finding_key/fingerprint
- original_title
- normalized_title
- original_severity
- normalized_severity
- category
- subcategory
- description
- impact
- recommendation
- affected_url
- endpoint
- parameter
- http_method
- evidence
- steps_to_reproduce
- source_tool
- source_template
- source_reference
- cwe
- owasp
- cvss_score
- status
- assigned_to
- first_detected
- last_detected
- created_at
- updated_at

Severity:
- Critical
- High
- Medium
- Low
- Informational

Status:
- Open
- In Progress
- Resolved
- Reopened
- Accepted Risk
- False Positive
- Closed

Do not scatter these values as frontend magic strings. Use shared constants/enums.

### Status history
`finding_status_history`
- id
- finding_id
- old_status
- new_status
- changed_by
- changed_at
- comment

### Users
- id
- name
- email
- role
- active
- created_at

Initial roles:
- Admin
- Security Analyst
- Viewer

### Audit logs
`audit_logs`
- id
- user_id
- action
- entity_type
- entity_id
- details
- timestamp

---

## 7. Finding Identity and Deduplication

Finding comparison and deduplication must use a stable fingerprint, not title similarity alone.

Fingerprint inputs may include:
- project
- normalized title/category
- endpoint
- parameter
- method
- relevant source information where needed

The implementation must avoid blindly merging:
- "Missing CSP"
- "Content Security Policy Missing"
- "CSP Header Not Configured"

These may be related, but similarity is not proof.

Support:
- potential duplicate detection;
- confidence/uncertainty indication;
- manual merge;
- keep separate.

Scan comparison must use fingerprints/identity, not title-only matching.

---

## 8. Supported Reports

Initial support:

### OWASP ZAP
- HTML
- JSON
- XML

Extract when present:
- alert
- risk
- confidence
- description
- URL
- method
- parameter
- evidence
- solution
- reference
- CWE
- WASC

### Nuclei
- JSON
- JSONL
- TXT

Extract when present:
- template-id
- name
- severity
- host
- matched-at
- description
- reference
- matcher-name
- type

### Excel
XLSX with flexible column mapping.

Recognize variations of:
- title/finding
- severity
- description
- URL
- endpoint
- evidence
- recommendation
- status

Do not require exact column names.

### CSV
Use similar flexible mapping.

### PDF
Extract structured information when confidently possible.

If a table can be reliably recognized, extract it.

If a field cannot be confidently extracted, mark it `Not Extracted` rather than guessing.

---

## 9. Upload Security

Validate:
- extension
- MIME type
- file size
- filename
- path traversal

Use safe server-side filenames.

Never execute uploaded files.

Treat uploaded HTML as untrusted content.

Reject/neutralize:
- `../`
- `../../`
- absolute path manipulation
- executable content/workflows

Default upload size should be configurable, e.g. `MAX_UPLOAD_SIZE_MB=50`.

---

## 10. Upload Processing Workflow

The canonical workflow is:

```text
Upload
  ↓
Validate file
  ↓
Detect report type
  ↓
Detect scanner
  ↓
Select parser
  ↓
Parse
  ↓
Normalize
  ↓
Validate extracted fields
  ↓
Detect potential duplicates
  ↓
Create scan
  ↓
Persist findings
  ↓
Calculate totals
  ↓
Update dashboard
  ↓
Show analysis summary
```

Do not silently fail.

Gracefully handle:
- invalid file
- unsupported format
- corrupted PDF
- unreadable Excel
- invalid JSON
- unknown scanner
- missing columns
- parser failure
- duplicate upload
- database failure

For failures, explain the reason and ensure partial invalid data is not silently committed.

---

## 11. Duplicate Uploads

If the same report is uploaded again:
- detect a likely duplicate using file hash and/or robust scan identity;
- warn the user;
- do not blindly duplicate findings;
- allow the user to cancel or intentionally continue where appropriate.

---

## 12. Dashboard Requirements

Create a professional, responsive, desktop-first security dashboard.

Show actual SQLite-derived:
- project count
- scan count
- total findings
- Critical
- High
- Medium
- Low
- Informational

Charts:
- severity distribution
- findings by project
- findings over time
- top vulnerability categories

Also provide:
- recent scans
- recent Critical/High findings
- remediation/status summary
- useful management indicators

Dashboard must be informative for:
- Project Manager
- QA Manager
- Security Analyst
- Developer

Do not invent metrics that cannot be calculated from stored data.

---

## 13. Main Navigation

Use a meaningful sidebar:

```text
Dashboard
Projects
Findings
Critical & High
Scans
Reports
Upload Report
Settings
```

Project navigation may include:
- Overview
- Findings
- Scans
- Trends
- Reports

Provide quick actions:
- New Project
- Upload VAPT Report
- View Critical Findings
- View High Findings

---

## 14. Findings Management

Findings page must support:
- search
- sort
- filter
- pagination
- project filtering
- severity filtering
- status filtering
- source-tool filtering
- category filtering
- date filtering
- assignee filtering

Columns should include:
- severity
- finding
- category
- endpoint
- source
- status
- first detected
- last detected

Finding details should expose, when available:
- description
- impact
- evidence
- steps to reproduce
- endpoint/URL
- recommendation
- source
- severity
- status
- CWE
- OWASP
- CVSS
- assignment
- status history

---

## 15. Bulk Operations

Support selecting multiple findings and changing remediation/status in one operation.

Bulk actions should:
- show selected count;
- require appropriate confirmation;
- update all selected records transactionally where practical;
- create status history/audit records;
- report successes/failures clearly.

Also support bulk upload of multiple VAPT reports.

Bulk upload must reuse the same parser pipeline as single upload rather than implementing a second parsing system.

---

## 16. Scan History and Comparison

Every successful report upload creates a scan record.

Display scans date-wise, newest first by default.

Show:
- scanner
- report
- scan date
- totals
- severity counts
- processing status

Comparison between two scans must show:
- New findings
- Resolved findings
- Persistent findings
- Reopened findings

Comparison is fingerprint-based.

Do not call a finding "resolved" merely because its title changed.

---

## 17. Remediation Library

Provide a library of standard remediation guidance mapped to common vulnerability types/categories.

Important:
- The remediation library is application guidance, not scanner evidence.
- It must never overwrite the original report recommendation.
- Clearly distinguish "Original Recommendation" from "Standard Remediation Guidance".
- Allow a finding to reference a relevant remediation guideline when mapping is confident.
- If mapping is uncertain, do not pretend it is exact.

---

## 18. Exports

Findings:
- CSV
- Excel
- JSON

Project report:
- Project information
- Executive summary
- risk summary
- severity distribution
- Critical findings
- High findings
- Medium findings
- Low findings
- detailed findings
- remediation summary
- scan information

Exports must be generated from current database data.

---

## 19. Original Report Retention

Never delete the original report as part of normal parsing.

Store under project/date-oriented paths, for example:

```text
data/uploads/<project>/<YYYY-MM-DD>/<safe-file-name>
```

Database must retain the stored-file reference.

---

## 20. Auditability

Record important actions:
- project created
- report uploaded
- finding updated
- status changed
- finding assigned
- finding deleted
- report exported
- bulk status updated
- scan compared
- duplicate decision/merge

Do not log credentials, tokens, passwords, or other secrets.

---

## 21. UI/UX

Target:
- clean
- minimal
- professional
- security-focused
- responsive
- desktop-first
- accessible tables
- clear typography
- good spacing
- sensible modal/drawer sizes
- meaningful navigation
- consistent severity indicators
- restrained use of bright colors

Use responsive grids and sensible screen/modal ratios.

Empty states:
- No projects yet
- No findings available
- No scans available
- No reports available

Loading states:
- upload progress
- parsing
- normalization
- duplicate detection
- saving

Never freeze the UI during long report processing.

---

## 22. API Baseline

Projects:
- GET `/api/projects`
- POST `/api/projects`
- GET `/api/projects/{id}`
- PUT `/api/projects/{id}`
- DELETE `/api/projects/{id}`

Scans:
- GET `/api/projects/{id}/scans`
- POST `/api/scans/upload`
- POST bulk upload endpoint as needed
- GET `/api/scans/{id}`
- DELETE `/api/scans/{id}`

Findings:
- GET `/api/findings`
- GET `/api/findings/{id}`
- PUT `/api/findings/{id}`
- DELETE `/api/findings/{id}`
- bulk status endpoint
- comparison endpoint

Dashboard:
- GET `/api/dashboard/summary`
- GET `/api/dashboard/severity`
- GET `/api/dashboard/projects`
- GET `/api/dashboard/trends`

Use query parameters for filtering rather than loading all data into the browser.

---

## 23. Database and Performance

Initialize SQLite on first run.

Create tables and useful indexes on:
- project_id
- scan_id
- severity
- status
- finding_key
- source_tool

Use SQLAlchemy models.

Avoid N+1 query patterns where practical.

For large findings lists:
- paginate at API/database level;
- filter at API/database level;
- sort at API/database level.

---

## 24. Configuration

Use environment variables for environment-specific settings.

Example:

```env
DATABASE_URL=sqlite:///./data/vapt.db
UPLOAD_DIRECTORY=./data/uploads
MAX_UPLOAD_SIZE_MB=50
```

Never hard-code environment-specific configuration.

---

## 25. Logging and Errors

Log:
- startup
- upload
- parser selection
- parsing result
- finding count
- duplicate detection
- database operations
- errors

Use structured/consistent logging where practical.

Never expose stack traces or internal filesystem paths unnecessarily to end users.

---

## 26. Testing

Backend tests must cover:
- project CRUD
- file upload
- ZAP parsing
- Nuclei parsing
- PDF parsing
- Excel parsing
- CSV parsing
- finding creation
- filtering
- severity calculation
- deduplication
- scan comparison
- status changes
- bulk status updates
- export
- upload security
- duplicate upload handling

Frontend tests must cover:
- dashboard loading
- project creation
- upload flow
- findings filtering
- finding details
- status update
- bulk status update
- navigation
- error handling

Use real parser fixtures under `sample-reports/` where possible.

---

## 27. Acceptance Tests

The application must eventually support these end-to-end scenarios:

1. Create a project and upload a ZAP report. Findings and severity totals appear from SQLite.
2. Upload Nuclei findings to the same project. Both sources are represented.
3. Create a second project. Its findings remain isolated.
4. Filter by Critical. Only Critical findings appear.
5. Filter High + Open. Only matching findings appear.
6. Open a finding and view its available evidence, endpoint, recommendation, source, severity and status.
7. Change Open → In Progress. Database and status history update.
8. Upload the same report again. User receives a duplicate warning rather than silent duplication.
9. Select multiple findings and bulk-update their status.
10. Compare two scans and correctly show new/resolved/persistent/reopened findings based on fingerprints.
11. Export filtered/current findings.
12. Upload multiple reports in bulk and process them through the same parser pipeline.

---

## 28. Development Phases

Follow these phase prompts in order:

- `phase-prompts/01-foundation.md`
- `phase-prompts/02-upload-parsers.md`
- `phase-prompts/03-findings-management.md`
- `phase-prompts/04-history-comparison-dashboard.md`
- `phase-prompts/05-document-parsers-exports-bulk.md`
- `phase-prompts/06-auth-rbac-audit.md`
- `phase-prompts/07-remediation-polish-hardening.md`

Do not implement active VAPT scanning in V1.

Future scanner integration may eventually support ZAP/Nuclei/Nmap, but V1 only manages uploaded reports.

---

## 29. Phase Completion Protocol

At the end of every phase, provide:

### Implemented
Exact features completed.

### Files changed
Important files created/modified.

### Database changes
Tables/indexes/migrations.

### APIs
New/changed endpoints.

### Tests
Tests run and results.

### Manual verification
What was actually exercised.

### Known limitations
Anything not verified or intentionally deferred.

### Next phase
The next phase prompt to execute.

Do not claim "production ready" unless the requested verification has actually been performed.

---

## 30. Local Development

Backend:

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Expected:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`

Docker must also be supported with persistent `./data`.

---

## 31. README

Maintain a useful README containing:
- overview
- architecture
- stack
- folder structure
- database structure
- installation
- configuration
- local run
- Docker
- API documentation
- supported reports
- parser extension guide
- testing
- troubleshooting
- future enhancements

---

## 32. Final Product Principle

The application should feel like a lightweight professional VAPT management platform, not a generic CRUD demo.

Prioritize:
1. correctness of security data;
2. traceability to original reports;
3. reliable parsing;
4. useful project/scan/finding management;
5. actionable remediation tracking;
6. meaningful management dashboards;
7. easy QA/security workflow;
8. maintainable code;
9. simple deployment.

When requirements conflict, favor data integrity, traceability, explicit user confirmation, and the simplest architecture that satisfies the requirement.
