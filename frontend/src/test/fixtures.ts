import type { Project } from '../types/project';
import type { Page } from '../types/api';
import type { DashboardSummary } from '../types/dashboard';
import type { Scan, SeverityCounts } from '../types/scan';

/** Test-only API response builders. Never imported by application code. */
export function buildProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 1,
    name: 'Customer Portal',
    application_name: 'Portal Web',
    description: null,
    environment: 'Production',
    application_url: null,
    owner: 'QA Team',
    status: 'Active',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    ...overrides,
  };
}

export function pageOf<T>(items: T[]): Page<T> {
  return { items, total: items.length, page: 1, page_size: 20 };
}

export const NO_FINDINGS: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, informational: 0, unclassified: 0 };

export function buildSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    project_count: 0,
    projects_by_status: [],
    projects_by_environment: [],
    recent_projects: [],
    scan_count: 0,
    failed_scan_count: 0,
    finding_count: 0,
    findings_by_severity: NO_FINDINGS,
    recent_scans: [],
    ...overrides,
  };
}

export function buildScan(overrides: Partial<Scan> = {}): Scan {
  return {
    id: 1,
    project_id: 1,
    project_name: 'Customer Portal',
    scan_name: 'zap-baseline.json',
    scanner: 'OWASP ZAP',
    report_type: 'JSON',
    original_filename: 'zap-baseline.json',
    scan_date: '2026-10-07T10:06:46Z',
    uploaded_at: '2026-10-07T10:10:00Z',
    processing_status: 'Completed',
    total_findings: 39,
    critical_count: 0,
    high_count: 0,
    medium_count: 9,
    low_count: 17,
    informational_count: 13,
    processing_error: null,
    ...overrides,
  };
}
