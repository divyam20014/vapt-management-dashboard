import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render';
import { dashboardService } from '../services/dashboardService';
import { projectService } from '../services/projectService';
import { buildSummary, pageOf } from '../test/fixtures';

vi.mock('../services/dashboardService');
vi.mock('../services/projectService');

const NAV_LABELS = ['Dashboard', 'Projects', 'Findings', 'Critical & High', 'Scans', 'Reports', 'Upload Report', 'Settings'];

describe('navigation', () => {
  beforeEach(() => {
    vi.mocked(dashboardService.getSummary).mockResolvedValue(buildSummary());
    vi.mocked(projectService.list).mockResolvedValue(pageOf([]));
  });

  it('renders every sidebar item in order', () => {
    renderApp('/');
    const nav = screen.getAllByRole('navigation', { name: 'Main navigation' })[0];
    const links = within(nav).getAllByRole('link').map((link) => link.textContent);
    expect(links).toEqual(NAV_LABELS);
  });

  it('navigates between sections and marks the active link', async () => {
    const user = userEvent.setup();
    renderApp('/');
    const nav = screen.getAllByRole('navigation', { name: 'Main navigation' })[0];

    await user.click(within(nav).getByRole('link', { name: 'Projects' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page');

    await user.click(within(nav).getByRole('link', { name: 'Findings' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Findings' })).toBeInTheDocument();
    expect(screen.getByText('Findings list not available yet')).toBeInTheDocument();

    await user.click(within(nav).getByRole('link', { name: 'Scans' }));
    expect(screen.getByText('Scan history view not available yet')).toBeInTheDocument();
  });

  it('quick action "New Project" opens the create form', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(screen.getByRole('link', { name: /New Project/ }));
    expect(await screen.findByRole('dialog', { name: 'New project' })).toBeInTheDocument();
  });

  it('shows a not-found page for unknown routes', () => {
    renderApp('/does-not-exist');
    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });
});
