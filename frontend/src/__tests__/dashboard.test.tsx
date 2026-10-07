import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render';
import { dashboardService } from '../services/dashboardService';
import { ApiError } from '../types/api';
import { buildProject } from '../test/fixtures';

vi.mock('../services/dashboardService');

describe('DashboardPage', () => {
  it('shows a loading state while the summary loads', () => {
    vi.mocked(dashboardService.getSummary).mockReturnValue(new Promise(() => {}));
    renderApp('/');
    expect(screen.getByRole('status')).toHaveTextContent('Loading dashboard');
  });

  it('shows the "No projects yet" empty state when the database is empty', async () => {
    vi.mocked(dashboardService.getSummary).mockResolvedValue({
      project_count: 0,
      projects_by_status: [],
      projects_by_environment: [],
      recent_projects: [],
    });
    renderApp('/');
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
  });

  it('renders the values returned by the API without adding any', async () => {
    vi.mocked(dashboardService.getSummary).mockResolvedValue({
      project_count: 3,
      projects_by_status: [
        { label: 'Active', count: 2 },
        { label: 'Archived', count: 1 },
      ],
      projects_by_environment: [{ label: 'Production', count: 3 }],
      recent_projects: [buildProject({ id: 7, name: 'Payments API' })],
    });
    renderApp('/');

    expect(await screen.findByTestId('stat-Projects')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-Active projects')).toHaveTextContent('2');
    expect(screen.getByTestId('stat-On Hold projects')).toHaveTextContent('0');
    expect(screen.getByTestId('stat-Archived projects')).toHaveTextContent('1');
    expect(screen.getByRole('link', { name: 'Payments API' })).toHaveAttribute('href', '/projects/7');
    // No scan/finding data exists yet: explicit empty states, not numbers.
    expect(screen.getByText('No findings available')).toBeInTheDocument();
    expect(screen.getByText('No scans available')).toBeInTheDocument();
  });

  it('shows an error state and retries', async () => {
    const user = userEvent.setup();
    vi.mocked(dashboardService.getSummary)
      .mockRejectedValueOnce(new ApiError('Unable to reach the server. Check that the backend is running.', null, 'network_error'))
      .mockResolvedValueOnce({ project_count: 0, projects_by_status: [], projects_by_environment: [], recent_projects: [] });

    renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(dashboardService.getSummary).toHaveBeenCalledTimes(2);
  });
});
