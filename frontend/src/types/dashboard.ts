import type { Project } from './project';

export interface CountByLabel {
  label: string;
  count: number;
}

export interface DashboardSummary {
  project_count: number;
  projects_by_status: CountByLabel[];
  projects_by_environment: CountByLabel[];
  recent_projects: Project[];
}
