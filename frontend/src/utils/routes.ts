export const ROUTES = {
  dashboard: '/',
  projects: '/projects',
  findings: '/findings',
  criticalHigh: '/critical-high',
  scans: '/scans',
  reports: '/reports',
  upload: '/upload',
  settings: '/settings',
  audit: '/audit-log',
  remediation: '/remediation',
} as const;

export const projectPath = (id: number) => `${ROUTES.projects}/${id}`;
export const findingPath = (id: number) => `${ROUTES.findings}/${id}`;
export const scanPath = (id: number) => `${ROUTES.scans}/${id}`;
export const guidelinePath = (slug: string) => `${ROUTES.remediation}/${encodeURIComponent(slug)}`;
/** Findings this guideline applies to. */
export const guidelineFindingsPath = (slug: string) => `${ROUTES.findings}?guidance=${encodeURIComponent(slug)}`;
export const COMPARE_PATH = `${ROUTES.scans}/compare`;
export const comparePath = (baseId: number, compareId: number) => `${COMPARE_PATH}?base=${baseId}&compare=${compareId}`;

/** Opens the create-project modal on the Projects page. */
export const NEW_PROJECT_PATH = `${ROUTES.projects}?new=1`;
