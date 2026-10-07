import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render';
import { signInAs } from '../test/auth';
import { buildScan, pageOf } from '../test/fixtures';
import { remediationService } from '../services/remediationService';
import { findingService } from '../services/findingService';
import { projectService } from '../services/projectService';
import { scanService } from '../services/scanService';
import type { GuidelineDetail, GuidelineSummary } from '../types/remediation';
import type { FindingDetail } from '../types/finding';

vi.mock('../services/remediationService');
vi.mock('../services/findingService');
vi.mock('../services/projectService');
vi.mock('../services/scanService');

const CSP: GuidelineSummary = {
  slug: 'content-security-policy', title: 'Define a Content Security Policy', category: 'Security headers',
  owasp: 'A05:2021 – Security Misconfiguration', summary: 'Send a Content-Security-Policy header.', cwe_ids: [], findings: 5, active_findings: 4,
};
const XSS: GuidelineSummary = {
  slug: 'cross-site-scripting', title: 'Prevent cross-site scripting (XSS)', category: 'Injection', owasp: 'A03:2021 – Injection',
  summary: 'Encode untrusted data.', cwe_ids: ['CWE-79'], findings: 0, active_findings: 0,
};
const CSP_DETAIL: GuidelineDetail = {
  ...CSP, steps: ['Inventory the origins.', 'Start with a restrictive policy.'], verification: 'Check the header.',
  references: [{ title: 'OWASP Content Security Policy Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html' }],
  zap_rules: ['10038', '10055'], nuclei_rules: ['http-missing-security-headers:content-security-policy'],
};

function finding(overrides: Partial<FindingDetail> = {}): FindingDetail {
  return {
    id: 7, project_id: 1, project_name: 'Juice Shop', scan_id: 1, finding_key: 'k',
    normalized_title: 'Content Security Policy (CSP) Header Not Set', original_title: 'Content Security Policy (CSP) Header Not Set',
    normalized_severity: 'Medium', original_severity: 'Medium', category: null, subcategory: null, endpoint: 'http://juice:3000/',
    affected_url: 'http://juice:3000', parameter: null, http_method: 'GET', source_tool: 'OWASP ZAP', source_template: '10038',
    source_reference: null, cwe: 'CWE-693', owasp: null, cvss_score: null, status: 'Open', assignee: null,
    first_detected: '2026-10-07T10:00:00Z', last_detected: '2026-10-07T10:00:00Z', occurrence_count: 1, created_at: '2026-10-07T10:00:00Z',
    updated_at: '2026-10-07T10:00:00Z', description: null, impact: null, recommendation: 'Ensure that your web server sets the CSP header.',
    evidence: null, steps_to_reproduce: null, source_metadata: {}, occurrences: [], status_history: [], potential_duplicates: [],
    standard_guidance: [{ slug: CSP.slug, title: CSP.title, category: CSP.category, summary: CSP.summary, match_type: 'scanner_rule', basis: 'OWASP ZAP alert 10038' }],
    ...overrides,
  } as FindingDetail;
}

beforeEach(() => {
  vi.mocked(remediationService.list).mockResolvedValue({ items: [CSP, XSS], categories: ['Injection', 'Security headers'], total: 2 });
  vi.mocked(remediationService.get).mockResolvedValue(CSP_DETAIL);
  vi.mocked(projectService.list).mockResolvedValue(pageOf([]));
  vi.mocked(findingService.list).mockResolvedValue(pageOf([]));
  vi.mocked(findingService.facets).mockResolvedValue({ source_tools: [], categories: [] });
});

describe('Remediation library', () => {
  it('lists guidance with linked-finding counts and searches on the server', async () => {
    const user = userEvent.setup();
    signInAs('Viewer');  // every role can read the library
    renderApp('/remediation');
    const list = await screen.findByRole('list', { name: 'Remediation guidelines' });
    expect(within(list).getByRole('link', { name: CSP.title })).toHaveAttribute('href', '/remediation/content-security-policy');
    expect(within(list).getByRole('link', { name: '4 active · 5 total' })).toHaveAttribute('href', '/findings?guidance=content-security-policy');
    expect(within(list).getByText('No linked findings')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search guidance'), 'CWE-79');
    await waitFor(() => expect(remediationService.list).toHaveBeenLastCalledWith({ search: 'CWE-79', category: undefined }));
    await user.selectOptions(screen.getByLabelText('Category'), 'Injection');
    await waitFor(() => expect(remediationService.list).toHaveBeenLastCalledWith({ search: 'CWE-79', category: 'Injection' }));
  });

  it('shows a guideline with its exact matching rules and safe external references', async () => {
    renderApp('/remediation/content-security-policy');
    expect(await screen.findByRole('heading', { level: 1, name: CSP.title })).toBeInTheDocument();
    expect(screen.getByText('Start with a restrictive policy.')).toBeInTheDocument();
    expect(screen.getByText('OWASP ZAP alert 10038')).toBeInTheDocument();
    expect(screen.getByText('Nuclei template http-missing-security-headers (content-security-policy)')).toBeInTheDocument();
    const reference = screen.getByRole('link', { name: /Content Security Policy Cheat Sheet/ });
    expect(reference).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'View 5 linked findings' })).toHaveAttribute('href', '/findings?guidance=content-security-policy');
  });
});

describe('Standard guidance on a finding', () => {
  it('is shown separately from the original recommendation, with how it was matched', async () => {
    vi.mocked(findingService.get).mockResolvedValue(finding());
    renderApp('/findings/7');
    await screen.findByRole('heading', { level: 1, name: /Content Security Policy/ });
    expect(screen.getByText('Ensure that your web server sets the CSP header.')).toBeInTheDocument();
    expect(screen.getByText('From the scanner report.')).toBeInTheDocument();
    const card = screen.getByRole('heading', { name: 'Standard remediation guidance' }).closest('section, div[class*="rounded"]') as HTMLElement;
    expect(within(card).getByRole('link', { name: CSP.title })).toHaveAttribute('href', '/remediation/content-security-policy');
    expect(within(card).getByText('Matched by scanner rule: OWASP ZAP alert 10038')).toBeInTheDocument();
    expect(within(card).getByText(/not from the scanner report/)).toBeInTheDocument();
  });

  it('marks a CWE-only match as needing a check, and says when there is no guidance', async () => {
    vi.mocked(findingService.get).mockResolvedValueOnce(
      finding({ standard_guidance: [{ slug: XSS.slug, title: XSS.title, category: XSS.category, summary: XSS.summary, match_type: 'cwe', basis: 'CWE-79' }] }),
    );
    const view = renderApp('/findings/7');
    expect(await screen.findByText('Matched by CWE-79 only. Check that the guidance fits this finding.')).toBeInTheDocument();
    view.unmount();
    vi.mocked(findingService.get).mockResolvedValueOnce(finding({ standard_guidance: [] }));
    renderApp('/findings/7');
    expect(await screen.findByText(/No library guideline matches this finding/)).toBeInTheDocument();
  });

  it('filters the findings list by guideline, and the filter can be removed', async () => {
    const user = userEvent.setup();
    renderApp('/findings?guidance=content-security-policy');
    await waitFor(() => expect(findingService.list).toHaveBeenLastCalledWith(expect.objectContaining({ remediation: 'content-security-policy' })));
    expect(await screen.findByRole('link', { name: CSP.title })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove standard guidance filter' }));
    await waitFor(() => expect(findingService.list).toHaveBeenLastCalledWith(expect.objectContaining({ remediation: undefined })));
  });
});

describe('Admin deletion', () => {
  it('deletes a finding after confirmation (Admin only)', async () => {
    const user = userEvent.setup();
    vi.mocked(findingService.get).mockResolvedValue(finding());
    vi.mocked(findingService.remove).mockResolvedValue();
    renderApp('/findings/7');
    await user.click(await screen.findByRole('button', { name: 'Delete finding' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete finding' });
    expect(dialog).toHaveTextContent('This cannot be undone');
    await user.click(within(dialog).getByRole('button', { name: 'Delete finding' }));
    expect(findingService.remove).toHaveBeenCalledWith(7);
    expect(await screen.findByRole('heading', { level: 1, name: 'Findings' })).toBeInTheDocument();
  });

  it('hides deletion from other roles', async () => {
    signInAs('Security Analyst');
    vi.mocked(findingService.get).mockResolvedValue(finding());
    vi.mocked(scanService.get).mockResolvedValue({ ...buildScan({ id: 3 }), previous_scan: null, next_scan: null } as never);
    const view = renderApp('/findings/7');
    await screen.findByRole('heading', { level: 1, name: /Content Security Policy/ });
    expect(screen.queryByRole('button', { name: 'Delete finding' })).not.toBeInTheDocument();
    view.unmount();
    renderApp('/scans/3');
    await screen.findByRole('heading', { level: 1, name: buildScan({ id: 3 }).scan_name });
    expect(screen.queryByRole('button', { name: 'Delete scan' })).not.toBeInTheDocument();
  });

  it('deletes a scan and reports failures', async () => {
    const user = userEvent.setup();
    vi.mocked(scanService.get).mockResolvedValue({ ...buildScan({ id: 3, project_id: 1 }), previous_scan: null, next_scan: null } as never);
    vi.mocked(scanService.remove).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ findings_removed: 2, findings_kept: 5 });
    vi.mocked(projectService.get).mockResolvedValue({ id: 1, name: 'Juice Shop' } as never);
    renderApp('/scans/3');
    await user.click(await screen.findByRole('button', { name: 'Delete scan' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete scan' });
    expect(dialog).toHaveTextContent('original file');
    await user.click(within(dialog).getByRole('button', { name: 'Delete scan' }));
    expect(await within(dialog).findByText('An unexpected error occurred.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete scan' }));
    await waitFor(() => expect(scanService.remove).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete scan' })).not.toBeInTheDocument());
  });
});
