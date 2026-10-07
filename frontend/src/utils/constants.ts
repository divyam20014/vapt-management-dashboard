/**
 * Shared enumerations. Values mirror backend/app/models/enums.py — keep them in sync.
 * Components must import these instead of using string literals.
 */

export const PROJECT_ENVIRONMENTS = ['Production', 'Staging', 'UAT', 'Development', 'Other'] as const;
export type ProjectEnvironment = (typeof PROJECT_ENVIRONMENTS)[number];

export const PROJECT_STATUSES = ['Active', 'On Hold', 'Archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const DEFAULT_PROJECT_STATUS: ProjectStatus = 'Active';

export const PROJECT_STATUS_STYLES: Record<ProjectStatus, string> = {
  Active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  'On Hold': 'bg-amber-50 text-amber-700 ring-amber-600/20',
  Archived: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};

/** Label used by the API for projects without an environment. */
export const NOT_SET_LABEL = 'Not Set';

export const DEFAULT_PAGE_SIZE = 20;

export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'Informational'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Keys used by the API for per-severity counts. */
export const SEVERITY_COUNT_KEYS: Record<Severity, 'critical' | 'high' | 'medium' | 'low' | 'informational'> = {
  Critical: 'critical',
  High: 'high',
  Medium: 'medium',
  Low: 'low',
  Informational: 'informational',
};

/** Restrained, consistent severity colours (badge classes and chart fills). */
export const SEVERITY_STYLES: Record<Severity, { badge: string; fill: string; dot: string }> = {
  Critical: { badge: 'bg-red-50 text-red-800 ring-red-600/25', fill: '#b91c1c', dot: 'bg-red-700' },
  High: { badge: 'bg-orange-50 text-orange-800 ring-orange-600/25', fill: '#ea580c', dot: 'bg-orange-600' },
  Medium: { badge: 'bg-amber-50 text-amber-800 ring-amber-600/25', fill: '#d97706', dot: 'bg-amber-500' },
  Low: { badge: 'bg-sky-50 text-sky-800 ring-sky-600/25', fill: '#0284c7', dot: 'bg-sky-600' },
  Informational: { badge: 'bg-slate-100 text-slate-700 ring-slate-500/25', fill: '#64748b', dot: 'bg-slate-500' },
};

/** Label for findings whose report severity does not map to the five standard levels. */
export const UNCLASSIFIED_LABEL = 'Unclassified';

export const SCAN_STATUSES = ['Completed', 'Failed'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const SUPPORTED_REPORTS = [
  { scanner: 'OWASP ZAP', formats: 'HTML, JSON, XML' },
  { scanner: 'Nuclei', formats: 'JSON, JSONL, TXT' },
] as const;

export const FINDING_STATUSES = ['Open', 'In Progress', 'Resolved', 'Reopened', 'Accepted Risk', 'False Positive', 'Closed'] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const FINDING_STATUS_STYLES: Record<FindingStatus, string> = {
  Open: 'bg-red-50 text-red-700 ring-red-600/20',
  'In Progress': 'bg-blue-50 text-blue-700 ring-blue-600/20',
  Resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Reopened: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  'Accepted Risk': 'bg-violet-50 text-violet-700 ring-violet-600/20',
  'False Positive': 'bg-slate-100 text-slate-600 ring-slate-500/20',
  Closed: 'bg-slate-100 text-slate-700 ring-slate-500/20',
};

/** Severity filter options, including findings whose report severity is not on the standard scale. */
export const SEVERITY_FILTER_OPTIONS: readonly string[] = [...SEVERITIES, UNCLASSIFIED_LABEL];
export const CRITICAL_HIGH: readonly Severity[] = ['Critical', 'High'];

export const USER_ROLES = ['Admin', 'Security Analyst', 'Viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Shown for report fields the scanner did not provide. */
export const NOT_PROVIDED = 'Not Provided';

/** Statuses that still need remediation work. */
export const ACTIVE_FINDING_STATUSES: readonly FindingStatus[] = ['Open', 'In Progress', 'Reopened'];

export const SCANNERS = ['OWASP ZAP', 'Nuclei'] as const;

export const CLASSIFICATIONS = ['New', 'Reopened', 'Resolved', 'Persistent'] as const;
export const CLASSIFICATION_STYLES: Record<(typeof CLASSIFICATIONS)[number], { badge: string; help: string }> = {
  New: { badge: 'bg-red-50 text-red-700 ring-red-600/20', help: 'In the current scan only, and never detected before the baseline.' },
  Reopened: { badge: 'bg-orange-50 text-orange-700 ring-orange-600/20', help: 'Absent from the baseline but detected in an earlier scan, and back in the current scan.' },
  Resolved: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', help: 'In the baseline, not detected in the current scan.' },
  Persistent: { badge: 'bg-slate-100 text-slate-700 ring-slate-500/20', help: 'Detected in both scans.' },
};

export const FINDING_PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_FINDING_PAGE_SIZE = 25;
export const MAX_BULK_FINDINGS = 500;
