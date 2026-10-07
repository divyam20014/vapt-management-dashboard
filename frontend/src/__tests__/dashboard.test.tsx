import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render';
import { dashboardService } from '../services/dashboardService';
import { ApiError } from '../types/api';
import { buildProject, buildScan, buildSummary } from '../test/fixtures';

vi.mock('../services/dashboardService');

describe('DashboardPage', () => {
  it('shows a loading state while the summary loads', () => {
    vi.mocked(dashboardService.getSummary).mockReturnValue(new Promise(() => {}));
    renderApp('/');
    expect(screen.getByRole('status')).toHaveTextContent('Loading dashboard');
  });

  it('shows the "No projects yet" empty state when the database is empty', async () => {
    vi.mocked(dashboardService.getSummary).mockResolvedValue(buildSummary());
    renderApp('/');
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
  });

  it('shows project metrics and honest empty states before any report is uploaded', async () => {
    vi.mocked(dashboardService.getSummary).mockResolvedValue(
      buildSummary({
        project_count: 3,
        projects_by_status: [
          { label: 'Active', count: 2 },
          { label: 'Archived', count: 1 },
        ],
        projects_by_environment: [{ label: 'Production', count: 3 }],
        recent_projects: [buildProject({ id: 7, name: 'Payments API' })],
      }),
    );
    renderApp('/');

    expect(await screen.findByTestId('stat-Projects')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-Scans')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-Findings')).toHaveTextContent('0');
    expect(screen.getByRole('link', { name: 'Payments API' })).toHaveAttribute('href', '/projects/7');
    expect(screen.getByText('No findings available')).toBeInTheDocument();
    expect(screen.getByText('No scans available')).toBeInTheDocument();
    expect(screen.queryByTestId('severity-Critical')).not.toBeInTheDocument();
  });

  it('renders scan and severity values exactly as returned by the API', async () => {
    vi.mocked(dashboardService.getSummary).mockResolvedValue(
      buildSummary({
        project_count: 1,
        scan_count: 2,
        failed_scan_count: 1,
        finding_count: 48,
        findings_by_severity: { critical: 1, high: 2, medium: 9, low: 17, informational: 19, unclassified: 0 },
        recent_projects: [buildProject()],
        recent_scans: [
          buildScan({ id: 3, scan_name: 'broken.json', processing_status: 'Failed', processing_error: 'The file is not valid JSON.', total_findings: 0 }),
          buildScan({ id: 2, scan_name: 'Baseline #1' }),
        ],
      }),
    );
    renderApp('/');

    expect(await screen.findByTestId('stat-Scans')).toHaveTextContent('2');
    expect(screen.getByText('1 failed upload(s) not counted')).toBeInTheDocument();
    expect(screen.getByTestId('stat-Findings')).toHaveTextContent('48');
    expect(screen.getByTestId('stat-Critical & High')).toHaveTextContent('3');
    expect(screen.getByTestId('severity-Critical')).toHaveTextContent('1');
    expect(screen.getByTestId('severity-Low')).toHaveTextContent('17');
    expect(screen.getByText('Baseline #1')).toBeInTheDocument();
    expect(screen.getByText('The file is not valid JSON.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Findings by severity: Critical 1, High 2, Medium 9, Low 17, Informational 19/ })).toBeInTheDocument();
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
