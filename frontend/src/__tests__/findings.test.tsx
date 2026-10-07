import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render';
import { findingService } from '../services/findingService';
import { projectService } from '../services/projectService';
import { userService } from '../services/userService';
import { signInAs } from '../test/auth';
import { ApiError } from '../types/api';
import { buildProject, pageOf } from '../test/fixtures';
import type { FindingDetail, FindingListItem } from '../types/finding';
import type { User } from '../types/user';

vi.mock('../services/findingService');
vi.mock('../services/projectService');

const ALICE: User = { id: 1, name: 'Alice Analyst', email: 'alice@example.com', role: 'Security Analyst', active: true, created_at: '2026-10-01T00:00:00Z', can_sign_in: true, last_login_at: null };
const BOB: User = { id: 2, name: 'Bob Admin', email: 'bob@example.com', role: 'Admin', active: true, created_at: '2026-10-01T00:00:00Z', can_sign_in: false, last_login_at: null };

function item(overrides: Partial<FindingListItem> = {}): FindingListItem {
  return {
    id: 1,
    project_id: 1,
    project_name: 'Juice Shop',
    normalized_title: 'Content Security Policy (CSP) Header Not Set',
    original_title: 'Content Security Policy (CSP) Header Not Set',
    normalized_severity: 'Medium',
    original_severity: 'Medium',
    category: null,
    endpoint: 'http://juice:3000/',
    affected_url: 'http://juice:3000',
    parameter: null,
    http_method: 'GET',
    source_tool: 'OWASP ZAP',
    source_template: '10038',
    cwe: 'CWE-693',
    status: 'Open',
    assignee: null,
    first_detected: '2026-10-07T10:06:46Z',
    last_detected: '2026-10-07T10:06:46Z',
    occurrence_count: 2,
    ...overrides,
  };
}

function detail(overrides: Partial<FindingDetail> = {}): FindingDetail {
  return {
    ...item({ id: 7, normalized_title: 'Cross-Domain Misconfiguration', original_title: 'Cross-Domain Misconfiguration', source_template: '10098', cwe: 'CWE-264' }),
    scan_id: 1,
    finding_key: 'abc',
    subcategory: null,
    description: 'Web browser data loading may be possible.',
    impact: null,
    recommendation: 'Ensure that sensitive data is not available in an unauthenticated manner.',
    evidence: 'Access-Control-Allow-Origin: *',
    steps_to_reproduce: null,
    source_reference: 'https://example.org/cors',
    owasp: null,
    cvss_score: null,
    source_metadata: { confidence: 'Medium', wasc: 'WASC-14' },
    created_at: '2026-10-07T10:10:00Z',
    updated_at: '2026-10-07T10:10:00Z',
    occurrences: [
      {
        id: 11,
        scan_id: 1,
        scan_name: 'ZAP baseline',
        scanner: 'OWASP ZAP',
        report_type: 'JSON',
        scan_date: '2026-10-07T10:06:46Z',
        uploaded_at: '2026-10-07T10:10:00Z',
        original_title: 'Cross-Domain Misconfiguration',
        original_severity: 'Medium',
        affected_url: 'http://juice:3000',
        parameter: null,
        http_method: 'GET',
        evidence: 'Access-Control-Allow-Origin: *',
      },
    ],
    status_history: [
      { id: 1, old_status: null, new_status: 'Open', changed_by: null, changed_at: '2026-10-07T10:10:00Z', comment: 'Detected in scan "ZAP baseline" (#1).' },
    ],
    potential_duplicates: [],
    standard_guidance: [],
    ...overrides,
  };
}

describe('Findings workspace', () => {
  beforeEach(() => {
    vi.mocked(findingService.list).mockReset();
    vi.mocked(findingService.list).mockResolvedValue(pageOf([item(), item({ id: 2, normalized_title: 'Timestamp Disclosure - Unix', normalized_severity: 'Low' })]));
    vi.mocked(findingService.facets).mockResolvedValue({ source_tools: ['Nuclei', 'OWASP ZAP'], categories: [] });
    vi.mocked(projectService.list).mockResolvedValue(pageOf([buildProject({ id: 1, name: 'Juice Shop' })]));
    vi.mocked(userService.list).mockResolvedValue([ALICE, BOB]);
  });

  it('lists findings returned by the API', async () => {
    renderApp('/findings');
    expect(await screen.findByRole('link', { name: 'Content Security Policy (CSP) Header Not Set' })).toHaveAttribute('href', '/findings/1');
    expect(screen.getByText('Timestamp Disclosure - Unix')).toBeInTheDocument();
    expect(findingService.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, page_size: 25, sort_by: 'severity', sort_order: 'desc' }));
  });

  it('reads filters from the address so they survive a refresh', async () => {
    renderApp('/findings?severity=High&status=Open&status=Reopened&source=Nuclei&assignee=unassigned&q=csp&from=2026-10-01&to=2026-10-07&sort=last_detected&order=asc&page=2');
    await screen.findByText('Timestamp Disclosure - Unix');
    expect(findingService.list).toHaveBeenLastCalledWith({
      page: 2,
      page_size: 25,
      search: 'csp',
      project_id: [],
      severity: ['High'],
      status: ['Open', 'Reopened'],
      source_tool: ['Nuclei'],
      category: [],
      assignee: 'unassigned',
      date_field: 'last_detected',
      date_from: '2026-10-01',
      date_to: '2026-10-07',
      sort_by: 'last_detected',
      sort_order: 'asc',
    });
    expect(screen.getByLabelText('Search findings')).toHaveValue('csp');
  });

  it('sends filter, sort and paging changes to the server', async () => {
    const user = userEvent.setup();
    vi.mocked(findingService.list).mockResolvedValue({ items: [item()], total: 60, page: 1, page_size: 25 });
    renderApp('/findings');
    await screen.findByText('Content Security Policy (CSP) Header Not Set');

    await user.click(screen.getByRole('button', { name: /Severity: All/ }));
    await user.click(within(screen.getByRole('listbox', { name: 'Severity' })).getByLabelText('Critical'));
    await waitFor(() => expect(findingService.list).toHaveBeenLastCalledWith(expect.objectContaining({ severity: ['Critical'], page: 1 })));

    await user.selectOptions(screen.getByLabelText('Filter by assignee'), 'Bob Admin');
    await waitFor(() => expect(findingService.list).toHaveBeenLastCalledWith(expect.objectContaining({ assignee: '2' })));

    await user.click(screen.getByRole('button', { name: 'Last detected' }));
    await waitFor(() => expect(findingService.list).toHaveBeenLastCalledWith(expect.objectContaining({ sort_by: 'last_detected', sort_order: 'desc' })));

    await user.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(findingService.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));

    await user.type(screen.getByLabelText('Search findings'), 'swagger');
    await waitFor(() => expect(findingService.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'swagger', page: 1 })), { timeout: 2000 });
  });

  it('bulk-updates the selected findings in one request and reloads from the server', async () => {
    const user = userEvent.setup();
    signInAs('Security Analyst');
    vi.mocked(findingService.bulkUpdate).mockResolvedValue({ requested: 2, updated: 2, unchanged: 0, updated_ids: [1, 2] });
    renderApp('/findings');
    await screen.findByText('Timestamp Disclosure - Unix');

    await user.click(screen.getByLabelText('Select all findings on this page'));
    const bar = screen.getByRole('region', { name: 'Bulk actions' });
    expect(bar).toHaveTextContent('2 selected');
    await user.click(within(bar).getByRole('button', { name: /Change status/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Update 2 selected findings' });
    const confirm = within(dialog).getByRole('button', { name: 'Update 2 findings' });
    expect(confirm).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText('New status'), 'In Progress');
    await user.selectOptions(within(dialog).getByLabelText('Assign to'), 'Bob Admin');
    await user.type(within(dialog).getByLabelText('Comment'), 'Sprint 42');
    const callsBefore = vi.mocked(findingService.list).mock.calls.length;
    await user.click(confirm);

    expect(findingService.bulkUpdate).toHaveBeenCalledWith([1, 2], { status: 'In Progress', assigned_to: 2, comment: 'Sprint 42' });
    expect(await screen.findByText(/Updated 2 findings/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(findingService.list).mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('gives a Viewer no selection or bulk actions (read-only)', async () => {
    signInAs('Viewer');
    renderApp('/findings');
    await screen.findByText('Timestamp Disclosure - Unix');
    expect(screen.queryByLabelText('Select all findings on this page')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Select Timestamp Disclosure - Unix')).not.toBeInTheDocument();
    // Exports are read access and remain available.
    expect(screen.getByRole('button', { name: /Export 2 findings/ })).toBeInTheDocument();
  });

  it('shows bulk failures and leaves the selection in place', async () => {
    const user = userEvent.setup();
    vi.mocked(findingService.bulkUpdate).mockRejectedValue(new ApiError('1 selected finding(s) no longer exist. Nothing was changed.', 404, 'not_found'));
    renderApp('/findings');
    await screen.findByText('Timestamp Disclosure - Unix');
    await user.click(screen.getByLabelText('Select all findings on this page'));
    await user.click(screen.getByRole('button', { name: /Change status/ }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('New status'), 'Closed');
    await user.click(within(dialog).getByRole('button', { name: 'Update 2 findings' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Nothing was changed');
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('2 selected');
  });

  it('Critical & High view always requests only those severities', async () => {
    renderApp('/critical-high?severity=Critical');
    await screen.findByText('Timestamp Disclosure - Unix');
    expect(findingService.list).toHaveBeenLastCalledWith(expect.objectContaining({ severity: ['Critical'] }));

    renderApp('/critical-high?severity=Low');
    await waitFor(() => expect(findingService.list).toHaveBeenLastCalledWith(expect.objectContaining({ severity: ['Critical', 'High'] })));
  });

  it('shows an empty state when no reports have been uploaded', async () => {
    vi.mocked(findingService.list).mockResolvedValue(pageOf([]));
    renderApp('/findings');
    expect(await screen.findByText('No findings available')).toBeInTheDocument();
  });
});

describe('Finding detail', () => {
  beforeEach(() => {
    vi.mocked(findingService.get).mockReset();
    vi.mocked(findingService.get).mockResolvedValue(detail());
    vi.mocked(userService.list).mockResolvedValue([ALICE, BOB]);
  });

  it('shows original vs normalized values, evidence and missing fields as Not Provided', async () => {
    renderApp('/findings/7');
    expect(await screen.findByRole('heading', { level: 1, name: 'Cross-Domain Misconfiguration' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Original (report)' })).toBeInTheDocument();
    expect(screen.getAllByText('Access-Control-Allow-Origin: *').length).toBeGreaterThan(0);
    expect(screen.getByText('Ensure that sensitive data is not available in an unauthenticated manner.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://example.org/cors' })).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    // impact, steps to reproduce, OWASP, CVSS, parameter are absent from the report
    expect(screen.getAllByText('Not Provided').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText('WASC-14')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Status history' })).getByText('System', { exact: false })).toBeInTheDocument();
  });

  it('saves a status change and shows the result returned by the server', async () => {
    const user = userEvent.setup();
    signInAs('Security Analyst');
    vi.mocked(findingService.update).mockResolvedValue(
      detail({
        status: 'In Progress',
        assignee: { id: 2, name: 'Bob Admin' },
        status_history: [
          { id: 2, old_status: 'Open', new_status: 'In Progress', changed_by: { id: 1, name: 'Alice Analyst' }, changed_at: '2026-10-07T11:00:00Z', comment: 'Fixing CORS' },
          ...detail().status_history,
        ],
      }),
    );
    renderApp('/findings/7');
    await screen.findByRole('heading', { level: 1, name: 'Cross-Domain Misconfiguration' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled());

    await user.selectOptions(screen.getByLabelText('Status'), 'In Progress');
    await user.selectOptions(screen.getByLabelText('Assignee'), 'Bob Admin');
    await user.type(screen.getByLabelText('Comment'), 'Fixing CORS');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(findingService.update).toHaveBeenCalledWith(7, { status: 'In Progress', assigned_to: 2, comment: 'Fixing CORS' });
    const history = await screen.findByRole('list', { name: 'Status history' });
    await waitFor(() => expect(history).toHaveTextContent('Open → In Progress'));
    expect(history).toHaveTextContent('Alice Analyst');
    expect(history).toHaveTextContent('Fixing CORS');
  });

  it('shows status and assignment read-only to a Viewer', async () => {
    signInAs('Viewer');
    renderApp('/findings/7');
    await screen.findByRole('heading', { level: 1, name: 'Cross-Domain Misconfiguration' });
    expect(screen.getByText('Your role can view findings but not change them.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
  });

  it('shows server errors from a status change', async () => {
    const user = userEvent.setup();
    vi.mocked(findingService.update).mockRejectedValue(new ApiError('Bob Admin is inactive and cannot be assigned findings.', 400, 'bad_request'));
    renderApp('/findings/7');
    await screen.findByRole('heading', { level: 1, name: 'Cross-Domain Misconfiguration' });
    await screen.findByRole('option', { name: 'Bob Admin' });
    await user.selectOptions(screen.getByLabelText('Assignee'), 'Bob Admin');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Bob Admin is inactive and cannot be assigned findings.')).toBeInTheDocument();
  });

  it('opens the original scanner record', async () => {
    const user = userEvent.setup();
    vi.mocked(findingService.rawOccurrence).mockResolvedValue({ id: 11, scan_id: 1, original_filename: 'zap-baseline.json', raw_record: { alert: { pluginid: '10098' } } });
    renderApp('/findings/7');
    await user.click(await screen.findByRole('button', { name: /Original record/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Original record' });
    expect(dialog).toHaveTextContent('"pluginid": "10098"');
    expect(findingService.rawOccurrence).toHaveBeenCalledWith(7, 11);
  });

  it('shows not found for a missing finding', async () => {
    vi.mocked(findingService.get).mockRejectedValue(new ApiError('Finding 999 was not found.', 404, 'not_found'));
    renderApp('/findings/999');
    expect(await screen.findByText('Finding not found')).toBeInTheDocument();
  });
});

describe('User management (Admin)', () => {
  it('adds a user with an initial password and a role', async () => {
    const user = userEvent.setup();
    vi.mocked(userService.list).mockResolvedValueOnce([]).mockResolvedValue([ALICE]);
    vi.mocked(userService.create).mockResolvedValue(ALICE);
    renderApp('/settings');
    expect(await screen.findByText('No users yet')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add user' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add user' });
    await user.type(within(dialog).getByLabelText(/Name/), 'Alice Analyst');
    await user.type(within(dialog).getByLabelText(/Email/), 'alice@example.com');
    await user.type(within(dialog).getByLabelText(/Initial password/), 'short');
    await user.click(within(dialog).getByRole('button', { name: 'Add user' }));
    expect(within(dialog).getByText('Use at least 12 characters.')).toBeInTheDocument();
    expect(userService.create).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByLabelText(/Initial password/));
    await user.type(within(dialog).getByLabelText(/Initial password/), 'correct-horse-battery');
    await user.click(within(dialog).getByRole('button', { name: 'Add user' }));
    expect(userService.create).toHaveBeenCalledWith({ name: 'Alice Analyst', email: 'alice@example.com', role: 'Security Analyst', password: 'correct-horse-battery' });
    expect(await screen.findByText('Alice Analyst')).toBeInTheDocument();
  });

  it('resets a password', async () => {
    const user = userEvent.setup();
    vi.mocked(userService.list).mockResolvedValue([ALICE, BOB]);
    vi.mocked(userService.setPassword).mockResolvedValue({ ...BOB, can_sign_in: true });
    renderApp('/settings');
    expect(await screen.findByText('No password set')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set password for Bob Admin' }));
    const dialog = await screen.findByRole('dialog', { name: 'Set password for Bob Admin' });
    await user.type(within(dialog).getByLabelText(/New password/), 'bobs-new-password-1');
    await user.click(within(dialog).getByRole('button', { name: 'Set password' }));
    expect(userService.setPassword).toHaveBeenCalledWith(2, 'bobs-new-password-1');
    expect(await screen.findByText('Password set for Bob Admin.')).toBeInTheDocument();
  });

  it('hides user management from other roles', async () => {
    signInAs('Security Analyst');
    vi.mocked(userService.list).mockResolvedValue([ALICE]);
    renderApp('/settings');
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add user' })).not.toBeInTheDocument();
  });
});
