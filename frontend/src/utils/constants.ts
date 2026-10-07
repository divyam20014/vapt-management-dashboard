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
