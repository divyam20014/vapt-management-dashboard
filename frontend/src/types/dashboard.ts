import type { Project } from './project';
import type { Scan, SeverityCounts } from './scan';

export interface CountByLabel {
  label: string;
  count: number;
}

export interface DashboardSummary {
  project_count: number;
  projects_by_status: CountByLabel[];
  projects_by_environment: CountByLabel[];
  recent_projects: Project[];
  scan_count: number;
  failed_scan_count: number;
  finding_count: number;
  findings_by_severity: SeverityCounts;
  recent_scans: Scan[];
}
