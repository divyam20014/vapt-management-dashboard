export const ROUTES = {
  dashboard: '/',
  projects: '/projects',
  findings: '/findings',
  criticalHigh: '/critical-high',
  scans: '/scans',
  reports: '/reports',
  upload: '/upload',
  settings: '/settings',
} as const;

export const projectPath = (id: number) => `${ROUTES.projects}/${id}`;

/** Opens the create-project modal on the Projects page. */
export const NEW_PROJECT_PATH = `${ROUTES.projects}?new=1`;
