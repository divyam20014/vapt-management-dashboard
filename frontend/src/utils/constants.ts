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
