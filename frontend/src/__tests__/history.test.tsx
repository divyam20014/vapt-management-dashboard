import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render';
import { scanService } from '../services/scanService';
import { projectService } from '../services/projectService';
import { findingService } from '../services/findingService';
import { dashboardService } from '../services/dashboardService';
import { ApiError } from '../types/api';
import { buildProject, buildScan, buildSummary, pageOf } from '../test/fixtures';
import type { ComparisonResult } from '../types/comparison';
import type { FindingListItem } from '../types/finding';

vi.mock('../services/scanService');
vi.mock('../services/projectService');
vi.mock('../services/findingService');
vi.mock('../services/dashboardService');

const week1 = buildScan({ id: 1, scan_name: 'week1.json', original_filename: 'week1.json', scan_date: '2026-09-01T09:00:00Z' });
const week2 = buildScan({ id: 2, scan_name: 'week2.json', original_filename: 'week2.json', scan_date: '2026-09-08T09:00:00Z' });
const week3 = buildScan({ id: 3, scan_name: 'week3.json', original_filename: 'week3.json', scan_date: '2026-09-15T09:00:00Z' });
const otherProject = buildScan({ id: 9, project_id: 2, project_name: 'Other', scan_name: 'other.json' });

function finding(id: number, title: string, overrides: Partial<FindingListItem> = {}): FindingListItem {
  return {
    id,
    project_id: 1,
    project_name: 'Customer Portal',
    normalized_title: title,
    original_title: title,
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
    first_detected: '2026-09-01T09:00:00Z',
    last_detected: '2026-09-15T09:00:00Z',
    occurrence_count: 2,
    ...overrides,
  };
}

const COMPARISON: ComparisonResult = {
  project_id: 1,
  project_name: 'Customer Portal',
  base: week2,
  compare: week3,
  reordered: false,
  warnings: [],
  counts: { new: 1, resolved: 1, persistent: 1, reopened: 1 },
  items: [
    { classification: 'New', finding: finding(4, 'Modern Web Application', { normalized_severity: 'Informational' }), reason: 'Detected in "week3.json" (#3), not in "week2.json" (#2), and in no earlier scan of this project.', base_observations: 0, compare_observations: 1, last_seen_before_base: null, renamed_from: null, attention: null },
    { classification: 'Reopened', finding: finding(2, 'Cross-Domain Misconfiguration', { status: 'Resolved' }), reason: 'Not detected in "week2.json" (#2), but detected earlier in "week1.json" (#1) and again in "week3.json" (#3).', base_observations: 0, compare_observations: 1, last_seen_before_base: { id: 1, scan_name: 'week1.json', scan_time: '2026-09-01T09:00:00Z' }, renamed_from: null, attention: 'Marked Resolved, but detected in "week3.json" (#3).' },
    { classification: 'Resolved', finding: finding(3, 'Timestamp Disclosure - Unix', { normalized_severity: 'Low' }), reason: 'Detected in "week2.json" (#2) but not in "week3.json" (#3).', base_observations: 1, compare_observations: 0, last_seen_before_base: null, renamed_from: null, attention: 'Not detected in "week3.json" (#3); status is still Open. Verify the fix and update the status.' },
    { classification: 'Persistent', finding: finding(1, 'Content Security Policy Header Missing'), reason: 'Same check (OWASP ZAP 10038) at the same location in both scans; the report title changed from "Content Security Policy (CSP) Header Not Set" to "Content Security Policy Header Missing".', base_observations: 1, compare_observations: 1, last_seen_before_base: null, renamed_from: { id: 7, title: 'Content Security Policy (CSP) Header Not Set' }, attention: null },
  ],
};

beforeEach(() => {
  vi.mocked(projectService.list).mockResolvedValue(pageOf([buildProject({ id: 1, name: 'Customer Portal' }), buildProject({ id: 2, name: 'Other' })]));
  vi.mocked(findingService.list).mockResolvedValue(pageOf([]));
  vi.mocked(findingService.facets).mockResolvedValue({ source_tools: [], categories: [] });
  vi.mocked(scanService.originalUrl).mockImplementation((id: number) => `/api/scans/${id}/original`);
});

describe('Scans page', () => {
  it('lists scans newest first from the API and filters on the server', async () => {
    const user = userEvent.setup();
    vi.mocked(scanService.list).mockResolvedValue(pageOf([week3, week2, week1]));
    renderApp('/scans');
    const rows = await screen.findAllByRole('link', { name: /week\d\.json/ });
    expect(rows.map((r) => r.textContent)).toEqual(['week3.json', 'week2.json', 'week1.json']);
    expect(scanService.list).toHaveBeenLastCalledWith(expect.objectContaining({ sort_by: 'scan_time', sort_order: 'desc', page: 1 }));

    await user.click(screen.getByRole('button', { name: /Scanner: All/ }));
    await user.click(within(screen.getByRole('listbox', { name: 'Scanner' })).getByLabelText('Nuclei'));
    await waitFor(() => expect(scanService.list).toHaveBeenLastCalledWith(expect.objectContaining({ scanner: ['Nuclei'] })));
  });

  it('compares two scans of the same project', async () => {
    const user = userEvent.setup();
    vi.mocked(scanService.list).mockResolvedValue(pageOf([week3, week2, otherProject]));
    vi.mocked(scanService.compare).mockResolvedValue(COMPARISON);
    renderApp('/scans');
    await user.click(await screen.findByLabelText('Select week3.json for comparison'));
    await user.click(screen.getByLabelText('Select other.json for comparison'));
    expect(screen.getByRole('region', { name: 'Compare scans' })).toHaveTextContent('different projects');
    expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled();

    await user.click(screen.getByLabelText('Select other.json for comparison'));
    await user.click(screen.getByLabelText('Select week2.json for comparison'));
    await user.click(screen.getByRole('button', { name: 'Compare' }));
    expect(await screen.findByTestId('count-New')).toHaveTextContent('1');
    expect(scanService.compare).toHaveBeenCalledWith(2, 3); // older scan becomes the baseline regardless of click order
  });
});

describe('Comparison view', () => {
  it('explains every classification and flags status conflicts', async () => {
    const user = userEvent.setup();
    vi.mocked(scanService.compare).mockResolvedValue(COMPARISON);
    renderApp('/scans/compare?base=2&compare=3');

    expect(await screen.findByTestId('count-Reopened')).toHaveTextContent('1');
    expect(screen.getByTestId('count-Persistent')).toHaveTextContent('1');
    expect(screen.getByText(/detected earlier in "week1.json"/)).toBeInTheDocument();
    expect(screen.getByText('Marked Resolved, but detected in "week3.json" (#3).')).toBeInTheDocument();
    expect(screen.getByText(/status is still Open/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Content Security Policy (CSP) Header Not Set' })).toHaveAttribute('href', '/findings/7');
    expect(screen.getByText(/2 finding\(s\) have a status that disagrees/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Resolved/ }));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('Timestamp Disclosure - Unix')).toBeInTheDocument();
  });

  it('shows warnings from the server', async () => {
    vi.mocked(scanService.compare).mockResolvedValue({
      ...COMPARISON,
      reordered: true,
      warnings: ['The scans were swapped so that the older scan is the baseline.', 'The scans come from different tools (OWASP ZAP and Nuclei).'],
    });
    renderApp('/scans/compare?base=3&compare=2');
    expect(await screen.findByText('The scans were swapped so that the older scan is the baseline.')).toBeInTheDocument();
    expect(screen.getByText(/different tools/)).toBeInTheDocument();
  });

  it('defaults the picker to the two latest completed scans of a project', async () => {
    const user = userEvent.setup();
    vi.mocked(scanService.list).mockResolvedValue(pageOf([week3, week2, week1]));
    vi.mocked(scanService.compare).mockResolvedValue(COMPARISON);
    renderApp('/scans/compare');
    await screen.findByRole('option', { name: 'Customer Portal' });
    await user.selectOptions(screen.getByLabelText('Project'), 'Customer Portal');
    await waitFor(() => expect(screen.getByLabelText('Current')).toHaveValue('3'));
    expect(screen.getByLabelText('Baseline (previous)')).toHaveValue('2');
    expect(scanService.list).toHaveBeenLastCalledWith(expect.objectContaining({ project_id: [1], status: ['Completed'] }));
    await user.click(screen.getByRole('button', { name: 'Compare' }));
    await screen.findByTestId('count-New');
    expect(scanService.compare).toHaveBeenCalledWith(2, 3);
  });

  it('reports invalid comparisons', async () => {
    vi.mocked(scanService.compare).mockRejectedValue(new ApiError('Scans can only be compared within the same project.', 422, 'invalid_comparison'));
    renderApp('/scans/compare?base=2&compare=9');
    expect(await screen.findByText('Scans can only be compared within the same project.')).toBeInTheDocument();
  });
});

describe('Scan detail', () => {
  it('shows the scan, its neighbours, the original report and its findings', async () => {
    vi.mocked(scanService.get).mockResolvedValue({ ...week2, previous_scan: week1, next_scan: week3 });
    renderApp('/scans/2');
    expect(await screen.findByRole('heading', { level: 1, name: 'week2.json' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Compare with previous scan/ })).toHaveAttribute('href', '/scans/compare?base=1&compare=2');
    expect(screen.getByRole('link', { name: /Original report/ })).toHaveAttribute('href', '/api/scans/2/original');
    expect(screen.getByRole('link', { name: /Previous/ })).toHaveAttribute('href', '/scans/1');
    expect(screen.getByRole('link', { name: /Next/ })).toHaveAttribute('href', '/scans/3');
    await waitFor(() => expect(findingService.list).toHaveBeenCalledWith(expect.objectContaining({ scan_id: 2 })));
  });

  it('shows the failure reason for a failed scan', async () => {
    vi.mocked(scanService.get).mockResolvedValue({
      ...buildScan({ id: 5, scan_name: 'broken.json', processing_status: 'Failed', processing_error: 'The file is not valid JSON.', scanner: null, report_type: null }),
      previous_scan: null,
      next_scan: null,
    });
    renderApp('/scans/5');
    expect(await screen.findByText('The file is not valid JSON.')).toBeInTheDocument();
    expect(screen.queryByText('Findings in this scan')).not.toBeInTheDocument();
  });
});

describe('Project dashboard', () => {
  it('loads metrics scoped to the project', async () => {
    vi.mocked(projectService.get).mockResolvedValue(buildProject({ id: 1, name: 'Customer Portal' }));
    vi.mocked(dashboardService.getSummary).mockResolvedValue(
      buildSummary({
        project_id: 1,
        project_count: 1,
        scan_count: 3,
        finding_count: 12,
        findings_by_severity: { critical: 0, high: 0, medium: 4, low: 5, informational: 3, unclassified: 0 },
        latest_scan: week3,
      }),
    );
    vi.mocked(dashboardService.getTrends).mockResolvedValue({ granularity: 'day', points: [{ period: '2026-09-15', discovered: 12, resolved: 0 }] });
    vi.mocked(scanService.listForProject).mockResolvedValue(pageOf([week3, week2, week1]));
    renderApp('/projects/1');

    expect((await screen.findAllByRole('link', { name: 'week3.json' })).length).toBe(2); // latest scan + history
    expect(dashboardService.getSummary).toHaveBeenCalledWith(1);
    // Severity cards and trends render once the summary has loaded (the scan list loads independently).
    expect(await screen.findByTestId('severity-Low')).toHaveTextContent('5');
    await waitFor(() => expect(dashboardService.getTrends).toHaveBeenCalledWith(1));
    expect(screen.getByRole('link', { name: /Compare latest two/ })).toHaveAttribute('href', '/scans/compare?base=2&compare=3');
    expect(screen.getByRole('link', { name: 'Download week1.json' })).toHaveAttribute('href', '/api/scans/1/original');
  });
});
