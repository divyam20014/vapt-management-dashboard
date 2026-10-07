import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render';
import { projectService } from '../services/projectService';
import { scanService } from '../services/scanService';
import { settingsService } from '../services/settingsService';
import { findingService } from '../services/findingService';
import { exportService } from '../services/exportService';
import { dashboardService } from '../services/dashboardService';
import { ApiError } from '../types/api';
import { buildProject, buildScan, buildSummary, pageOf } from '../test/fixtures';
import type { UploadResult } from '../types/scan';

vi.mock('../services/projectService');
vi.mock('../services/scanService');
vi.mock('../services/settingsService');
vi.mock('../services/findingService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/findingService')>();
  return { ...actual, findingService: { list: vi.fn(), get: vi.fn(), facets: vi.fn(), update: vi.fn(), bulkUpdate: vi.fn(), rawOccurrence: vi.fn() } };
});
vi.mock('../services/exportService');
vi.mock('../services/dashboardService');

const SETTINGS = {
  app_name: 'VAPT Management Dashboard',
  version: '0.5.0',
  database_engine: 'SQLite',
  database_location: 'data/vapt.db',
  upload_location: 'data/uploads',
  export_location: 'exports',
  max_upload_size_mb: 50,
  allowed_extensions: ['.html', '.htm', '.json', '.jsonl', '.xml', '.txt', '.csv', '.xlsx', '.pdf'],
};

function result(name: string, newFindings: number): UploadResult {
  return {
    scan: buildScan({ id: newFindings + 100, scan_name: name }),
    parser: 'OWASP ZAP JSON',
    records_parsed: newFindings,
    new_findings: newFindings,
    existing_findings: 0,
    severity_counts: { critical: 0, high: 0, medium: 0, low: 0, informational: newFindings, unclassified: 0 },
    potential_duplicates: [],
    warnings: [],
  };
}

const file = (name: string, body = '{}') => new File([body], name, { type: 'application/octet-stream' });

beforeEach(() => {
  vi.mocked(projectService.list).mockResolvedValue(pageOf([buildProject({ id: 1, name: 'Customer Portal' })]));
  vi.mocked(settingsService.get).mockResolvedValue(SETTINGS);
  vi.mocked(scanService.upload).mockReset();
});

describe('Bulk upload', () => {
  it('uploads each file through the single-upload API and summarises the batch', async () => {
    const user = userEvent.setup();
    vi.mocked(scanService.upload).mockImplementation(async ({ file: f, allowDuplicate }) => {
      if (f.name === 'zap.json') return result('zap.json', 39);
      if (f.name === 'nuclei.jsonl') return result('nuclei.jsonl', 9);
      if (f.name === 'broken.json') throw new ApiError('The file is not valid JSON.', 422, 'parse_error', [], { scan_id: 7 });
      if (f.name === 'again.json' && !allowDuplicate)
        throw new ApiError('Already uploaded.', 409, 'duplicate_upload', [], { existing_scan: buildScan({ scan_name: 'zap.json' }) });
      if (f.name === 'again.json') return result('again.json', 0);
      throw new ApiError('File type ".exe" is not supported.', 415, 'unsupported_media_type');
    });
    renderApp('/upload?project=1');
    await screen.findByLabelText(/^Project/);
    await user.upload(screen.getByLabelText('Report file'), [file('zap.json'), file('nuclei.jsonl'), file('broken.json'), file('again.json')]);
    expect(within(screen.getByRole('list', { name: 'Selected reports' })).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByLabelText('Scan name')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Upload 4 reports' }));
    const summary = await screen.findByTestId('bulk-summary');
    expect(scanService.upload).toHaveBeenCalledTimes(4);
    expect(within(summary).getByText('Succeeded').nextSibling).toHaveTextContent('2');
    expect(within(summary).getByText('Failed').nextSibling).toHaveTextContent('1');
    expect(within(summary).getByText('Duplicates').nextSibling).toHaveTextContent('1');
    expect(within(summary).getByText('Findings added').nextSibling).toHaveTextContent('48');

    const rows = screen.getByRole('list', { name: 'Upload status per file' });
    expect(within(rows).getByText('The file is not valid JSON.')).toBeInTheDocument();
    expect(within(rows).getByRole('link', { name: 'View failed scan' })).toHaveAttribute('href', '/scans/7');
    expect(within(rows).getByText('Already uploaded as "zap.json"; skipped.')).toBeInTheDocument();

    await user.click(within(rows).getByRole('button', { name: 'Upload anyway' }));
    await waitFor(() => expect(scanService.upload).toHaveBeenLastCalledWith(expect.objectContaining({ allowDuplicate: true }), expect.any(Function)));
    await waitFor(() => expect(within(screen.getByTestId('bulk-summary')).getByText('Succeeded').nextSibling).toHaveTextContent('3'));
  });

  it('rejects unsupported files but keeps the valid ones', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderApp('/upload?project=1');
    await screen.findByLabelText(/^Project/);
    await user.upload(screen.getByLabelText('Report file'), [file('ok.csv'), file('tool.exe'), file('report.xlsx')]);
    expect(screen.getByRole('alert')).toHaveTextContent('"tool.exe" is not a supported file type');
    expect(within(screen.getByRole('list', { name: 'Selected reports' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('ok.csv'),
      expect.stringContaining('report.xlsx'),
    ]);
  });

  it('a single file still uses the single-upload summary', async () => {
    const user = userEvent.setup();
    vi.mocked(scanService.upload).mockResolvedValue(result('zap.json', 39));
    renderApp('/upload?project=1');
    await screen.findByLabelText(/^Project/);
    await user.upload(screen.getByLabelText('Report file'), file('zap.json'));
    await user.click(screen.getByRole('button', { name: 'Upload and analyse' }));
    expect(await screen.findByTestId('upload-summary')).toBeInTheDocument();
  });
});

describe('Exports', () => {
  beforeEach(() => {
    vi.mocked(findingService.list).mockResolvedValue({ ...pageOf([]), total: 0 });
    vi.mocked(findingService.facets).mockResolvedValue({ source_tools: [], categories: [] });
    vi.mocked(exportService.findings).mockResolvedValue('findings.csv');
    vi.mocked(exportService.projectReport).mockResolvedValue('report.html');
    vi.mocked(exportService.list).mockResolvedValue([]);
  });

  it('exports exactly the filtered findings, ignoring paging', async () => {
    const user = userEvent.setup();
    vi.mocked(findingService.list).mockResolvedValue({
      items: [
        {
          id: 1, project_id: 1, project_name: 'Customer Portal', normalized_title: 'CSP', original_title: 'CSP', normalized_severity: 'Medium',
          original_severity: 'Medium', category: null, endpoint: '/', affected_url: '/', parameter: null, http_method: 'GET', source_tool: 'OWASP ZAP',
          source_template: '10038', cwe: null, status: 'Open', assignee: null, first_detected: '2026-10-07T00:00:00Z', last_detected: '2026-10-07T00:00:00Z',
          occurrence_count: 1,
        },
      ],
      total: 37,
      page: 2,
      page_size: 25,
    });
    renderApp('/findings?severity=Medium&status=Open&page=2');
    await user.click(await screen.findByRole('button', { name: /Export 37 findings/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Excel (XLSX)' }));
    const [query, format] = vi.mocked(exportService.findings).mock.calls[0];
    expect(format).toBe('xlsx');
    expect(query).toMatchObject({ severity: ['Medium'], status: ['Open'] });
    expect(query).not.toHaveProperty('page');
    expect(query).not.toHaveProperty('page_size');
  });

  it('Reports page generates a project report and lists saved exports', async () => {
    const user = userEvent.setup();
    vi.mocked(exportService.list)
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { name: '20261007-101010-000001_project-report_customer-portal.html', kind: 'project_report', format: 'html', size: 20480, created_at: '2026-10-07T10:10:10Z' },
      ]);
    renderApp('/reports');
    expect(await screen.findByText('No reports available')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Project'), 'Customer Portal');
    await user.click(screen.getByRole('button', { name: 'Generate project report' }));
    expect(exportService.projectReport).toHaveBeenCalledWith(1);
    expect(await screen.findByText(/Project report · HTML · 20 KB/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Download 20261007/ }));
    expect(exportService.saved).toHaveBeenCalledWith('20261007-101010-000001_project-report_customer-portal.html');
  });

  it('Reports page shows export errors', async () => {
    const user = userEvent.setup();
    vi.mocked(exportService.findings).mockRejectedValue(new ApiError('Export failed.', 500, 'internal_error'));
    renderApp('/reports');
    await user.click(await screen.findByRole('button', { name: 'Export all findings' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Export failed.');
    expect(exportService.findings).toHaveBeenCalledWith({}, 'xlsx');
  });

  it('project page offers the project report', async () => {
    const user = userEvent.setup();
    vi.mocked(projectService.get).mockResolvedValue(buildProject({ id: 1 }));
    vi.mocked(dashboardService.getSummary).mockResolvedValue(buildSummary({ project_id: 1, project_count: 1 }));
    vi.mocked(dashboardService.getTrends).mockResolvedValue({ granularity: 'day', points: [] });
    vi.mocked(scanService.listForProject).mockResolvedValue(pageOf([]));
    renderApp('/projects/1');
    await user.click(await screen.findByRole('button', { name: 'Project report' }));
    expect(exportService.projectReport).toHaveBeenCalledWith(1);
  });
});

describe('Not Extracted', () => {
  it('distinguishes values the report did not provide from values that could not be read', async () => {
    vi.mocked(findingService.get).mockResolvedValue({
      id: 9, project_id: 1, project_name: 'Customer Portal', normalized_title: 'CSP', original_title: 'CSP', normalized_severity: 'Medium',
      original_severity: 'Medium', category: null, endpoint: 'http://x/', affected_url: 'http://x', parameter: null, http_method: 'GET',
      source_tool: 'OWASP ZAP', source_template: '10038', cwe: 'CWE-693', status: 'Open', assignee: null, first_detected: '2026-10-07T00:00:00Z',
      last_detected: '2026-10-07T00:00:00Z', occurrence_count: 1, scan_id: 1, finding_key: 'k', subcategory: null, description: 'd', impact: null,
      recommendation: 'r', evidence: null, steps_to_reproduce: null, source_reference: null, owasp: null, cvss_score: null,
      source_metadata: { not_extracted: ['parameter'], confidence: 'High' }, created_at: '2026-10-07T00:00:00Z', updated_at: '2026-10-07T00:00:00Z',
      occurrences: [], status_history: [], potential_duplicates: [], standard_guidance: [],
    });
    renderApp('/findings/9');
    const parameter = (await screen.findByText('Parameter')).nextSibling as HTMLElement;
    expect(parameter).toHaveTextContent('Not Extracted');
    const impact = screen.getByText('Impact').nextSibling as HTMLElement;
    expect(impact).toHaveTextContent('Not Provided');
    expect(screen.queryByText('not extracted')).not.toBeInTheDocument(); // not listed as metadata
  });
});
