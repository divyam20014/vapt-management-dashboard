import { listProjectOptions } from '../services/projectOptions';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import EmptyState from '../components/states/EmptyState';
import LoadingState from '../components/states/LoadingState';
import ErrorState from '../components/states/ErrorState';
import { exportService, type ExportFormat } from '../services/exportService';
import { toApiError } from '../services/api';
import { useApiQuery } from '../hooks/useApiQuery';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatDateTime } from '../utils/format';
import { ROUTES } from '../utils/routes';

const SELECT =
  'block w-full rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-teal-600 focus:outline-none';

const KIND_LABELS = { findings: 'Findings export', project_report: 'Project report', other: 'Export' } as const;

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ReportsPage() {
  useDocumentTitle('Reports');
  const projects = useApiQuery(() => listProjectOptions(), []);
  const saved = useApiQuery(() => exportService.list(), []);
  const [projectId, setProjectId] = useState('');
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      saved.reload();
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Reports" description="Project reports and findings exports, generated from the current database." />
      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card title="Project report" description="Project information, executive and risk summary, findings by severity, detailed findings, remediation and scan information. HTML file you can print to PDF.">
          <div className="space-y-4">
            <div>
              <label htmlFor="report-project" className="mb-1.5 block text-sm font-medium text-slate-700">Project</label>
              <select id="report-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={SELECT}>
                <option value="">Select a project</option>
                {(projects.data?.items ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              icon={<FileText className="size-4" aria-hidden />}
              disabled={!projectId}
              loading={busy === 'report'}
              onClick={() => void run('report', () => exportService.projectReport(Number(projectId)))}
            >
              Generate project report
            </Button>
          </div>
        </Card>

        <Card title="All findings" description="Every finding across all projects. To export a filtered set, use Export on the Findings page.">
          <div className="space-y-4">
            <div>
              <label htmlFor="export-format" className="mb-1.5 block text-sm font-medium text-slate-700">Format</label>
              <select id="export-format" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)} className={SELECT}>
                <option value="xlsx">Excel (XLSX)</option>
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                icon={<FileSpreadsheet className="size-4" aria-hidden />}
                loading={busy === 'findings'}
                onClick={() => void run('findings', () => exportService.findings({}, format))}
              >
                Export all findings
              </Button>
              <Link to={ROUTES.findings} className="text-sm font-medium text-teal-700 hover:text-teal-800">
                Filter findings first
              </Link>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Generated files" description="Every export is kept in the export folder." className="mt-6" bodyClassName={saved.data?.length ? '' : 'p-5'}>
        {saved.error ? (
          <ErrorState title="Exports could not be listed" message={saved.error.message} onRetry={saved.reload} />
        ) : !saved.data ? (
          <LoadingState />
        ) : saved.data.length === 0 ? (
          <EmptyState compact icon={<FileText className="size-5" aria-hidden />} title="No reports available" description="Generated reports and exports will be listed here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {saved.data.map((file) => (
              <li key={file.name} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-slate-800" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {KIND_LABELS[file.kind]} · {file.format.toUpperCase()} · {size(file.size)} · {formatDateTime(file.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void run(file.name, () => exportService.saved(file.name))}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
                  aria-label={`Download ${file.name}`}
                >
                  <Download className="size-3.5" aria-hidden />
                  Download
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
