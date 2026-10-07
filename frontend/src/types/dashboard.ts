import type { FindingListItem } from './finding';
import type { Project } from './project';
import type { Scan, SeverityCounts } from './scan';
import type { FindingStatus } from '../utils/constants';

export interface CountByLabel {
  label: string;
  count: number;
}

export interface ProjectFindings {
  project_id: number;
  project_name: string;
  total: number;
  severity: SeverityCounts;
}

export interface Indicators {
  active_findings: number;
  active_critical_high: number;
  unassigned_active: number;
  resolved_last_30_days: number;
  oldest_active_critical_high: string | null;
}

export interface DashboardSummary {
  project_id: number | null;
  project_count: number;
  scan_count: number;
  failed_scan_count: number;
  finding_count: number;
  findings_by_severity: SeverityCounts;
  active_by_severity: SeverityCounts;
  status_summary: { status: FindingStatus; count: number }[];
  indicators: Indicators;
  findings_by_project: ProjectFindings[];
  top_categories: CountByLabel[];
  top_cwes: { cwe: string; count: number; example_title: string }[];
  recent_scans: Scan[];
  latest_scan: Scan | null;
  recent_critical_high: FindingListItem[];
  projects_by_status: CountByLabel[];
  projects_by_environment: CountByLabel[];
  recent_projects: Project[];
}

export interface Trends {
  granularity: 'day' | 'month';
  points: { period: string; discovered: number; resolved: number }[];
}
