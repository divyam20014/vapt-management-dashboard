import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { renderApp } from '../test/render';
import { currentUser, signInAs } from '../test/auth';
import { buildProject, buildSummary, pageOf } from '../test/fixtures';
import { api, onUnauthorized } from '../services/api';
import { authService } from '../services/authService';
import { auditService } from '../services/auditService';
import { dashboardService } from '../services/dashboardService';
import { projectService } from '../services/projectService';
import { findingService } from '../services/findingService';
import { scanService } from '../services/scanService';
import { userService } from '../services/userService';
import { ApiError } from '../types/api';
import type { AuditEntry } from '../types/audit';
import type { FindingDetail } from '../types/finding';

vi.mock('../services/auditService');
vi.mock('../services/dashboardService');
vi.mock('../services/projectService');
vi.mock('../services/findingService');
vi.mock('../services/scanService');

beforeEach(() => {
  vi.mocked(dashboardService.getSummary).mockResolvedValue(buildSummary());
  vi.mocked(dashboardService.getTrends).mockResolvedValue({ granularity: 'day', points: [] });
  vi.mocked(projectService.list).mockResolvedValue(pageOf([buildProject({ id: 1, name: 'Juice Shop' })]));
  vi.mocked(scanService.list).mockResolvedValue(pageOf([]));
});

describe('Sign-in', () => {
  it('asks for the first Admin when nobody can sign in yet', async () => {
    const user = userEvent.setup();
    vi.mocked(authService.status).mockResolvedValue({ setup_required: true, user: null });
    vi.mocked(authService.setup).mockResolvedValue(currentUser('Admin', { name: 'First Admin' }));
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Create the first Admin' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Name/), 'First Admin');
    await user.type(screen.getByLabelText(/^Email/), 'admin@example.test');
    await user.type(screen.getByLabelText(/^Password/), 'short');
    await user.type(screen.getByLabelText(/^Confirm password/), 'short');
    await user.click(screen.getByRole('button', { name: 'Create Admin and sign in' }));
    expect(screen.getByText('Use at least 12 characters.')).toBeInTheDocument();
    expect(authService.setup).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/^Password/));
    await user.clear(screen.getByLabelText(/^Confirm password/));
    await user.type(screen.getByLabelText(/^Password/), 'a long admin passphrase');
    await user.type(screen.getByLabelText(/^Confirm password/), 'a long admin passphrase');
    await user.click(screen.getByRole('button', { name: 'Create Admin and sign in' }));
    expect(authService.setup).toHaveBeenCalledWith({ name: 'First Admin', email: 'admin@example.test', password: 'a long admin passphrase' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  it('shows the server message for a failed sign-in and opens the app after a successful one', async () => {
    const user = userEvent.setup();
    vi.mocked(authService.status).mockResolvedValue({ setup_required: false, user: null });
    vi.mocked(authService.login)
      .mockRejectedValueOnce(new ApiError('Email or password is incorrect.', 401, 'invalid_credentials'))
      .mockResolvedValueOnce(currentUser('Security Analyst'));
    renderApp('/findings');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Email/), 'analyst@example.test');
    await user.type(screen.getByLabelText(/^Password/), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(screen.getByLabelText(/^Password/)).toHaveValue('');

    vi.mocked(findingService.list).mockResolvedValue(pageOf([]));
    vi.mocked(findingService.facets).mockResolvedValue({ source_tools: [], categories: [] });
    await user.type(screen.getByLabelText(/^Password/), 'right-password-123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(authService.login).toHaveBeenLastCalledWith('analyst@example.test', 'right-password-123');
    // The page that was requested opens after signing in.
    expect(await screen.findByRole('heading', { level: 1, name: 'Findings' })).toBeInTheDocument();
  });

  it('signs out from the account menu', async () => {
    const user = userEvent.setup();
    vi.mocked(authService.logout).mockResolvedValue();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Account: Test Admin (Admin)' }));
    expect(screen.getByRole('menu')).toHaveTextContent('Role: Admin');
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(authService.logout).toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('changes the password from the account menu', async () => {
    const user = userEvent.setup();
    vi.mocked(authService.changePassword)
      .mockRejectedValueOnce(new ApiError('The request contains invalid data.', 422, 'validation_error', [{ field: 'current_password', message: 'The current password is incorrect.' }]))
      .mockResolvedValueOnce();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: /Account:/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Change password' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change password' });
    await user.type(within(dialog).getByLabelText(/^Current password/), 'wrong-one');
    await user.type(within(dialog).getByLabelText(/^New password/), 'a brand new passphrase');
    await user.type(within(dialog).getByLabelText(/^Confirm new password/), 'a brand new passphrase');
    await user.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(await within(dialog).findByText('The current password is incorrect.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(await within(dialog).findByText('Your password was changed.')).toBeInTheDocument();
    expect(authService.changePassword).toHaveBeenLastCalledWith('wrong-one', 'a brand new passphrase');
  });
});

describe('API client security', () => {
  it('sends the CSRF header and reports an ended session', async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    const handler = vi.fn();
    onUnauthorized(handler);
    const originalAdapter = api.defaults.adapter;
    api.defaults.adapter = async (config) => {
      seen.push(config);
      const response = { status: 401, statusText: '', headers: {}, config, data: { error: { code: 'not_authenticated', message: 'Your session has expired. Sign in again.' } } };
      throw new AxiosError('401', 'ERR_BAD_REQUEST', config, undefined, response);
    };
    try {
      await expect(api.post('/projects', { name: 'x' })).rejects.toMatchObject({ status: 401, code: 'not_authenticated' });
    } finally {
      api.defaults.adapter = originalAdapter;
      onUnauthorized(null);
    }
    expect(AxiosHeaders.from(seen[0].headers).get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(seen[0].withCredentials).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns to sign-in when a page finds the session has ended', async () => {
    renderApp('/');
    await screen.findByRole('navigation', { name: 'Main navigation' });
    // Any request answered with 401 not_authenticated (expired session, deactivated account) ends the signed-in view.
    const originalAdapter = api.defaults.adapter;
    api.defaults.adapter = async (config) => {
      throw new AxiosError('401', 'ERR_BAD_REQUEST', config, undefined, {
        status: 401, statusText: '', headers: {}, config, data: { error: { code: 'not_authenticated', message: 'Your session has expired.' } },
      });
    };
    try {
      await api.get('/projects').catch(() => undefined);
    } finally {
      api.defaults.adapter = originalAdapter;
    }
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Your session has ended. Sign in again.');
  });
});

describe('Role-based UI', () => {
  it('shows project actions by role (the API enforces the same rules)', async () => {
    vi.mocked(projectService.get).mockResolvedValue(buildProject({ id: 1, name: 'Juice Shop' }));
    vi.mocked(dashboardService.getSummary).mockResolvedValue(buildSummary({ project_count: 1 }));
    vi.mocked(scanService.listForProject).mockResolvedValue(pageOf([]));

    signInAs('Viewer');
    const viewer = renderApp('/projects/1');
    expect(await screen.findByRole('button', { name: 'Project report' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Upload report/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete$/ })).not.toBeInTheDocument();
    viewer.unmount();

    signInAs('Security Analyst');
    renderApp('/projects/1');
    expect(await screen.findByRole('link', { name: /Upload report/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Edit$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete$/ })).not.toBeInTheDocument();
  });

  it('lets an analyst keep a potential duplicate separate, and hides that from a viewer', async () => {
    const user = userEvent.setup();
    const finding = {
      id: 7, project_id: 1, project_name: 'Juice Shop', scan_id: 1, finding_key: 'k',
      normalized_title: 'Strict-Transport-Security Header Not Set', original_title: 'Strict-Transport-Security Header Not Set',
      normalized_severity: 'Low', original_severity: 'Low', category: null, subcategory: null, endpoint: 'http://juice:3000/',
      affected_url: 'http://juice:3000', parameter: null, http_method: 'GET', source_tool: 'OWASP ZAP', source_template: '10035',
      source_reference: null, cwe: 'CWE-319', owasp: null, cvss_score: null, status: 'Open', assignee: null,
      first_detected: '2026-10-07T10:00:00Z', last_detected: '2026-10-07T10:00:00Z', occurrence_count: 1, created_at: '2026-10-07T10:00:00Z',
      updated_at: '2026-10-07T10:00:00Z', description: null, impact: null, recommendation: null, evidence: null, steps_to_reproduce: null,
      references: [], source_metadata: {}, occurrences: [], status_history: [],
      potential_duplicates: [{ id: 3, other_finding_id: 40, other_title: 'HTTP Missing Security Headers', other_source: 'Nuclei', reason: 'Same endpoint', confidence: 'Low', decision: 'Pending' }],
    } as unknown as FindingDetail;
    vi.mocked(findingService.get).mockResolvedValue(finding);
    vi.mocked(findingService.decideDuplicate).mockResolvedValue({
      ...finding,
      potential_duplicates: [{ ...finding.potential_duplicates[0], decision: 'Kept Separate' }],
    });
    vi.mocked(userService.list).mockResolvedValue([]);

    signInAs('Viewer');
    const viewer = renderApp('/findings/7');
    expect(await screen.findByText('HTTP Missing Security Headers')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep separate' })).not.toBeInTheDocument();
    viewer.unmount();

    signInAs('Security Analyst');
    renderApp('/findings/7');
    await user.click(await screen.findByRole('button', { name: 'Keep separate' }));
    expect(findingService.decideDuplicate).toHaveBeenCalledWith(7, 3, 'Kept Separate');
    expect(await screen.findByText(/Low confidence · Kept Separate/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo decision' })).toBeInTheDocument();
  });
});

describe('Audit Log', () => {
  const ENTRIES: AuditEntry[] = [
    {
      id: 2, timestamp: '2026-10-07T11:00:00Z', action: 'finding.status_changed', action_label: 'Finding status changed',
      entity_type: 'finding', entity_id: 7, user: { id: 2, name: 'Alice' }, project: { id: 1, name: 'Juice Shop' },
      finding: { id: 7, title: 'Cross-Domain Misconfiguration' }, details: { from: 'Open', to: 'In Progress', comment: 'Fixing' },
    },
    {
      id: 1, timestamp: '2026-10-07T10:00:00Z', action: 'project.deleted', action_label: 'Project deleted',
      entity_type: 'project', entity_id: 9, user: { id: 1, name: 'Test Admin' }, project: { id: 9, name: null }, finding: null,
      details: { name: 'Temporary' },
    },
  ];

  beforeEach(() => {
    vi.mocked(auditService.list).mockResolvedValue({ items: ENTRIES, total: 2, page: 1, page_size: 50 });
    vi.mocked(auditService.actions).mockResolvedValue([
      { code: 'finding.status_changed', label: 'Finding status changed' },
      { code: 'project.deleted', label: 'Project deleted' },
    ]);
    vi.mocked(userService.list).mockResolvedValue([
      { id: 2, name: 'Alice', email: 'alice@example.test', role: 'Security Analyst', active: true, created_at: '2026-10-01T00:00:00Z', can_sign_in: true, last_login_at: null },
    ]);
  });

  it('shows user, action, project, finding and timestamp, and filters on the server', async () => {
    const user = userEvent.setup();
    renderApp('/audit-log');
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(within(rows[0]).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Timestamp', 'User', 'Action', 'Project', 'Finding', 'Details']);
    expect(rows[1]).toHaveTextContent('Alice');
    expect(rows[1]).toHaveTextContent('Finding status changed');
    expect(within(rows[1]).getByRole('link', { name: 'Juice Shop' })).toHaveAttribute('href', '/projects/1');
    expect(within(rows[1]).getByRole('link', { name: 'Cross-Domain Misconfiguration' })).toHaveAttribute('href', '/findings/7');
    expect(rows[1]).toHaveTextContent('from: Open');
    expect(rows[2]).toHaveTextContent('#9 (deleted)');

    await screen.findByRole('option', { name: 'Alice' });
    await user.selectOptions(screen.getByLabelText('User'), 'Alice');
    await waitFor(() => expect(auditService.list).toHaveBeenLastCalledWith({ user_id: 2, page: 1, page_size: 50 }));
    await screen.findByRole('option', { name: 'Project deleted' });
    await user.selectOptions(screen.getByLabelText('Action'), 'Project deleted');
    await waitFor(() => expect(auditService.list).toHaveBeenLastCalledWith({ user_id: 2, action: 'project.deleted', page: 1, page_size: 50 }));
  });

  it('is not shown to a Security Analyst', async () => {
    signInAs('Security Analyst');
    renderApp('/audit-log');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    expect(auditService.list).not.toHaveBeenCalled();
  });
});
