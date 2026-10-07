import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render';
import { dashboardService } from '../services/dashboardService';
import { ApiError } from '../types/api';
import { buildProject, buildScan, buildSummary } from '../test/fixtures';
import type { FindingListItem } from '../types/finding';

vi.mock('../services/dashboardService');

const critical: FindingListItem = {
  id: 41,
  project_id: 1,
  project_name: 'Payments API',
  normalized_title: 'SQL Injection',
  original_title: 'SQL Injection',
  normalized_severity: 'Critical',
  original_severity: 'critical',
  category: null,
  endpoint: 'https://pay.example.com/search',
  affected_url: 'https://pay.example.com/search?q=1',
  parameter: 'q',
  http_method: 'GET',
  source_tool: 'Nuclei',
  source_template: 'sqli-error',
  cwe: 'CWE-89',
  status: 'Open',
  assignee: null,
  first_detected: '2026-10-05T09:00:00Z',
  last_detected: '2026-10-05T09:00:00Z',
  occurrence_count: 1,
};

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(dashboardService.getTrends).mockResolvedValue({ granularity: 'day', points: [] });
  });

  it('shows a loading state while the summary loads', async () => {
    vi.mocked(dashboardService.getSummary).mockReturnValue(new Promise(() => {}));
    renderApp('/');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Loading dashboard'));
  });

  it('shows the "No projects yet" empty state when the database is empty', async () => {
    vi.mocked(dashboardService.getSummary).mockResolvedValue(buildSummary());
    renderApp('/');
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
  });

  it('shows honest empty states before any report is uploaded', async () => {
    vi.mocked(dashboardService.getSummary).mockResolvedValue(buildSummary({ project_count: 3, recent_projects: [buildProject()] }));
    renderApp('/');
    expect(await screen.findByTestId('stat-Projects')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-Scans')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-Findings')).toHaveTextContent('0');
    expect(screen.getAllByText('No findings available').length).toBeGreaterThan(0);
    expect(screen.getByText('No scans available')).toBeInTheDocument();
    expect(screen.queryByTestId('severity-Critical')).not.toBeInTheDocument();
    expect(await screen.findByText('No trend data yet')).toBeInTheDocument();
  });

  it('renders every metric exactly as returned by the API', async () => {
    vi.mocked(dashboardService.getSummary).mockResolvedValue(
      buildSummary({
        project_count: 2,
        scan_count: 5,
        failed_scan_count: 1,
        finding_count: 60,
        findings_by_severity: { critical: 1, high: 2, medium: 9, low: 17, informational: 31, unclassified: 0 },
        active_by_severity: { critical: 1, high: 1, medium: 9, low: 10, informational: 31, unclassified: 0 },
        status_summary: [
          { status: 'Open', count: 40 },
          { status: 'In Progress', count: 10 },
          { status: 'Resolved', count: 6 },
          { status: 'Reopened', count: 2 },
          { status: 'Accepted Risk', count: 1 },
          { status: 'False Positive', count: 1 },
          { status: 'Closed', count: 0 },
        ],
        indicators: {
          active_findings: 52,
          active_critical_high: 2,
          unassigned_active: 30,
          resolved_last_30_days: 6,
          oldest_active_critical_high: '2026-09-01T00:00:00Z',
        },
        findings_by_project: [
          { project_id: 1, project_name: 'Payments API', total: 60, severity: { critical: 1, high: 2, medium: 9, low: 17, informational: 31, unclassified: 0 } },
        ],
        top_cwes: [{ cwe: 'CWE-693', count: 20, example_title: 'Content Security Policy (CSP) Header Not Set' }],
        recent_critical_high: [critical],
        recent_scans: [buildScan({ scan_name: 'Baseline #1' })],
        recent_projects: [buildProject()],
      }),
    );
    vi.mocked(dashboardService.getTrends).mockResolvedValue({
      granularity: 'day',
      points: [
        { period: '2026-10-05', discovered: 50, resolved: 0 },
        { period: '2026-10-06', discovered: 10, resolved: 6 },
      ],
    });
    renderApp('/');

    expect(await screen.findByTestId('stat-Scans')).toHaveTextContent('5');
    expect(screen.getByText('1 failed upload(s) not counted')).toBeInTheDocument();
    expect(screen.getByTestId('stat-Findings')).toHaveTextContent('60');
    expect(screen.getByTestId('stat-Critical & High')).toHaveTextContent('3');
    expect(screen.getByTestId('severity-Low')).toHaveTextContent('17');
    expect(screen.getByTestId('indicator-Active findings')).toHaveTextContent('52');
    expect(screen.getByTestId('indicator-Active Critical & High')).toHaveTextContent('2');
    expect(screen.getByTestId('indicator-Active & unassigned')).toHaveTextContent('30');
    expect(screen.getByTestId('status-group-Needs action')).toHaveTextContent('52');
    expect(screen.getByTestId('status-group-Fixed')).toHaveTextContent('6');
    expect(screen.getByTestId('status-group-Exceptions')).toHaveTextContent('2');
    expect(screen.getByRole('link', { name: 'CWE-693' })).toBeInTheDocument();
    expect(screen.getByText('By CWE (the uploaded reports provide no categories)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'SQL Injection' })).toHaveAttribute('href', '/findings/41');
    expect(screen.getByRole('link', { name: 'Baseline #1' })).toHaveAttribute('href', '/scans/1');
    expect(screen.getByRole('img', { name: /Findings by project: Payments API 60/ })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /60 findings discovered and 6 resolved/ })).toBeInTheDocument();
    const criticalCard = screen.getByTestId('severity-Critical').closest('a')!;
    expect(within(criticalCard).getByText('1 active')).toBeInTheDocument();
    expect(criticalCard).toHaveAttribute('href', '/findings?severity=Critical');
  });

  it('shows an error state and retries', async () => {
    const user = userEvent.setup();
    vi.mocked(dashboardService.getSummary)
      .mockRejectedValueOnce(new ApiError('Unable to reach the server. Check that the backend is running.', null, 'network_error'))
      .mockResolvedValueOnce(buildSummary());

    renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(dashboardService.getSummary).toHaveBeenCalledTimes(2);
  });
});
