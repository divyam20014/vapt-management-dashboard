import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render';
import { dashboardService } from '../services/dashboardService';
import { projectService } from '../services/projectService';
import { findingService } from '../services/findingService';
import { scanService } from '../services/scanService';
import { buildSummary, pageOf } from '../test/fixtures';
import { signInAs } from '../test/auth';

vi.mock('../services/dashboardService');
vi.mock('../services/projectService');
vi.mock('../services/findingService');
vi.mock('../services/scanService');

const NAV_LABELS = ['Dashboard', 'Projects', 'Findings', 'Critical & High', 'Scans', 'Remediation Library', 'Reports', 'Upload Report', 'Audit Log', 'Settings'];

describe('navigation', () => {
  beforeEach(() => {
    vi.mocked(dashboardService.getSummary).mockResolvedValue(buildSummary());
    vi.mocked(projectService.list).mockResolvedValue(pageOf([]));
    vi.mocked(findingService.list).mockResolvedValue(pageOf([]));
    vi.mocked(findingService.facets).mockResolvedValue({ source_tools: [], categories: [] });
    vi.mocked(scanService.list).mockResolvedValue(pageOf([]));
    vi.mocked(dashboardService.getTrends).mockResolvedValue({ granularity: 'day', points: [] });
  });

  it('renders every sidebar item in order (Admin)', async () => {
    renderApp('/');
    const nav = (await screen.findAllByRole('navigation', { name: 'Main navigation' }))[0];
    const links = within(nav).getAllByRole('link').map((link) => link.textContent);
    expect(links).toEqual(NAV_LABELS);
  });

  it('shows a Viewer only what the role can use', async () => {
    signInAs('Viewer');
    renderApp('/');
    const nav = (await screen.findAllByRole('navigation', { name: 'Main navigation' }))[0];
    const links = within(nav).getAllByRole('link').map((link) => link.textContent);
    expect(links).toEqual(NAV_LABELS.filter((label) => label !== 'Upload Report' && label !== 'Audit Log'));
    expect(screen.queryByRole('link', { name: /New Project/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Upload VAPT Report/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account: Test Viewer (Viewer)' })).toBeInTheDocument();
  });

  it('tells a Viewer who opens an Admin or upload page that the role has no access', async () => {
    signInAs('Viewer');
    renderApp('/audit-log');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    expect(screen.getByText(/Your role \(Viewer\) does not allow this/)).toBeInTheDocument();
  });

  it('navigates between sections and marks the active link', async () => {
    const user = userEvent.setup();
    renderApp('/');
    const nav = (await screen.findAllByRole('navigation', { name: 'Main navigation' }))[0];

    await user.click(within(nav).getByRole('link', { name: 'Projects' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page');

    await user.click(within(nav).getByRole('link', { name: 'Findings' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Findings' })).toBeInTheDocument();
    expect(await screen.findByText('No findings available')).toBeInTheDocument();

    await user.click(within(nav).getByRole('link', { name: 'Scans' }));
    expect(await screen.findByText('No scans available')).toBeInTheDocument();
  });

  it('quick action "New Project" opens the create form', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('link', { name: /New Project/ }));
    expect(await screen.findByRole('dialog', { name: 'New project' })).toBeInTheDocument();
  });

  it('shows a not-found page for unknown routes', async () => {
    renderApp('/does-not-exist');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });
});
