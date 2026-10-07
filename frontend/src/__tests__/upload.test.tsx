import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render';
import { projectService } from '../services/projectService';
import { scanService } from '../services/scanService';
import { settingsService } from '../services/settingsService';
import { ApiError } from '../types/api';
import { buildProject, buildScan, pageOf } from '../test/fixtures';
import type { UploadResult } from '../types/scan';

vi.mock('../services/projectService');
vi.mock('../services/scanService');
vi.mock('../services/settingsService');

const SETTINGS = {
  app_name: 'VAPT Management Dashboard',
  version: '0.2.0',
  database_engine: 'SQLite',
  database_location: 'data/vapt.db',
  upload_location: 'data/uploads',
  export_location: 'exports',
  max_upload_size_mb: 1,
  allowed_extensions: ['.html', '.htm', '.json', '.jsonl', '.xml', '.txt'],
};

const RESULT: UploadResult = {
  scan: buildScan({ scan_name: 'Baseline #1' }),
  parser: 'OWASP ZAP JSON',
  records_parsed: 45,
  new_findings: 39,
  existing_findings: 0,
  severity_counts: { critical: 0, high: 0, medium: 9, low: 17, informational: 13, unclassified: 0 },
  potential_duplicates: [
    {
      finding_id: 40,
      finding_title: 'HTTP Missing Security Headers: content-security-policy',
      finding_source: 'Nuclei',
      candidate_finding_id: 1,
      candidate_title: 'Content Security Policy (CSP) Header Not Set',
      candidate_source: 'OWASP ZAP',
      endpoint: 'http://juice:3000/',
      reason: 'Same endpoint and CWE-693; titles share the key words: content, policy.',
      confidence: 'Medium',
    },
  ],
  warnings: [],
};

const reportFile = (name = 'zap-baseline.json', body = '{"site": []}') => new File([body], name, { type: 'application/json' });

async function chooseProjectAndFile(user: ReturnType<typeof userEvent.setup>, file = reportFile()) {
  await user.selectOptions(await screen.findByLabelText(/^Project/), 'Customer Portal');
  await user.upload(screen.getByLabelText('Report file'), file);
}

describe('UploadReportPage', () => {
  beforeEach(() => {
    vi.mocked(projectService.list).mockResolvedValue(pageOf([buildProject()]));
    vi.mocked(settingsService.get).mockResolvedValue(SETTINGS);
    vi.mocked(scanService.upload).mockReset();
  });

  it('asks for a project first when none exist', async () => {
    vi.mocked(projectService.list).mockResolvedValue(pageOf([]));
    renderApp('/upload');
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
  });

  it('uploads a report, shows progress, then the analysis summary', async () => {
    const user = userEvent.setup();
    let release: (value: UploadResult) => void = () => {};
    vi.mocked(scanService.upload).mockImplementation((_input, onProgress) => {
      onProgress?.(0.5);
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    renderApp('/upload');
    await chooseProjectAndFile(user);
    expect(screen.getByText('zap-baseline.json')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Scan name'), 'Baseline #1');
    await user.click(screen.getByRole('button', { name: 'Upload and analyse' }));

    expect(await screen.findByText('50%')).toBeInTheDocument();
    expect(scanService.upload).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 1, scanName: 'Baseline #1', allowDuplicate: false }),
      expect.any(Function),
    );

    release(RESULT);
    const summary = await screen.findByTestId('upload-summary');
    expect(within(summary).getByText('OWASP ZAP JSON')).toBeInTheDocument();
    expect(within(summary).getByText('Records in report').nextSibling).toHaveTextContent('45');
    expect(within(summary).getByText('New findings').nextSibling).toHaveTextContent('39');
    expect(within(summary).getByText('Potential duplicates (1)')).toBeInTheDocument();
    expect(within(summary).getByText('Content Security Policy (CSP) Header Not Set')).toBeInTheDocument();
    expect(within(summary).getByText(/were not merged/)).toBeInTheDocument();
  });

  it('rejects unsupported and oversized files before uploading', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderApp('/upload');
    await screen.findByLabelText(/^Project/);

    await user.upload(screen.getByLabelText('Report file'), new File(['MZ'], 'tool.exe'));
    expect(screen.getByRole('alert')).toHaveTextContent('not a supported file type');

    await user.upload(screen.getByLabelText('Report file'), reportFile('big.json', 'x'.repeat(1024 * 1024 + 1)));
    expect(screen.getByRole('alert')).toHaveTextContent('larger than the 1 MB limit');
    expect(screen.getByRole('button', { name: 'Upload and analyse' })).toBeDisabled();
    expect(scanService.upload).not.toHaveBeenCalled();
  });

  it('warns about a duplicate upload and continues only when confirmed', async () => {
    const user = userEvent.setup();
    vi.mocked(scanService.upload)
      .mockRejectedValueOnce(
        new ApiError('This report has already been uploaded to this project.', 409, 'duplicate_upload', [], {
          existing_scan: buildScan({ scan_name: 'Baseline #1' }),
        }),
      )
      .mockResolvedValueOnce({ ...RESULT, new_findings: 0, existing_findings: 39 });
    renderApp('/upload');
    await chooseProjectAndFile(user);
    await user.click(screen.getByRole('button', { name: 'Upload and analyse' }));

    const dialog = await screen.findByRole('dialog', { name: 'This report was already uploaded' });
    expect(dialog).toHaveTextContent('Baseline #1');
    expect(scanService.upload).toHaveBeenCalledTimes(1);

    await user.click(within(dialog).getByRole('button', { name: 'Upload anyway' }));
    await screen.findByTestId('upload-summary');
    expect(scanService.upload).toHaveBeenLastCalledWith(expect.objectContaining({ allowDuplicate: true }), expect.any(Function));
  });

  it('cancelling the duplicate warning uploads nothing', async () => {
    const user = userEvent.setup();
    vi.mocked(scanService.upload).mockRejectedValueOnce(
      new ApiError('This report has already been uploaded to this project.', 409, 'duplicate_upload', [], { existing_scan: buildScan() }),
    );
    renderApp('/upload');
    await chooseProjectAndFile(user);
    await user.click(screen.getByRole('button', { name: 'Upload and analyse' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(scanService.upload).toHaveBeenCalledTimes(1);
  });

  it('explains parser failures', async () => {
    const user = userEvent.setup();
    vi.mocked(scanService.upload).mockRejectedValue(
      new ApiError('The file is not valid JSON: Expecting value: line 1 column 1 (char 0).', 422, 'parse_error', [], { scan_id: 5 }),
    );
    renderApp('/upload');
    await chooseProjectAndFile(user);
    await user.click(screen.getByRole('button', { name: 'Upload and analyse' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The report could not be processed');
    expect(alert).toHaveTextContent('not valid JSON');
    expect(alert).toHaveTextContent('original file was kept');
  });

  it('preselects the project from the address', async () => {
    renderApp('/upload?project=1');
    expect(await screen.findByLabelText(/^Project/)).toHaveValue('1');
  });
});
