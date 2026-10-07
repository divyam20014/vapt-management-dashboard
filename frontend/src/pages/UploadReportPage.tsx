import { MAX_PROJECT_OPTIONS, listProjectOptions } from '../services/projectOptions';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CircleAlert, FolderKanban, LoaderCircle, Plus } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Button, { buttonClasses } from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { TextField } from '../components/ui/FormField';
import EmptyState from '../components/states/EmptyState';
import LoadingState from '../components/states/LoadingState';
import ErrorState from '../components/states/ErrorState';
import FileDropzone from '../components/upload/FileDropzone';
import BulkUploadProgress, { type BulkItem } from '../components/upload/BulkUploadProgress';
import UploadSummary from '../components/upload/UploadSummary';
import { scanService } from '../services/scanService';
import { settingsService } from '../services/settingsService';
import { toApiError } from '../services/api';
import { useApiQuery } from '../hooks/useApiQuery';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { SUPPORTED_REPORTS } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import { NEW_PROJECT_PATH, projectPath } from '../utils/routes';
import type { ApiError } from '../types/api';
import type { Scan, UploadResult } from '../types/scan';

type Phase = 'idle' | 'uploading' | 'processing' | 'done' | 'failed' | 'bulk';

const MAX_FILES = 25;

const PROJECT_LIMIT = MAX_PROJECT_OPTIONS;

function existingScanFrom(error: ApiError): Scan | null {
  const details = error.details as { existing_scan?: Scan } | null;
  return details?.existing_scan ?? null;
}

export default function UploadReportPage() {
  useDocumentTitle('Upload Report');
  const [searchParams] = useSearchParams();
  const projects = useApiQuery(() => listProjectOptions(), []);
  const settings = useApiQuery(() => settingsService.get(), []);

  const [projectId, setProjectId] = useState(searchParams.get('project') ?? '');
  const [scanName, setScanName] = useState('');
  const [scanDate, setScanDate] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0] ?? null;
  const isBulk = files.length > 1;
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<Scan | null>(null);
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);

  const busy = phase === 'uploading' || phase === 'processing' || bulkRunning;

  // Leaving or reloading the page while a report is being sent or processed loses the result view.
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const updateItem = (index: number, change: Partial<BulkItem>) =>
    setBulkItems((items) => items.map((item, i) => (i === index ? { ...item, ...change } : item)));

  /** Same endpoint and pipeline as a single upload, one file at a time, so each file reports its own result. */
  const uploadOne = async (index: number, target: File, allowDuplicate: boolean) => {
    updateItem(index, { outcome: 'uploading', progress: 0, message: null });
    try {
      const uploaded = await scanService.upload(
        { projectId: Number(projectId), file: target, scanDate: scanDate || undefined, allowDuplicate },
        (fraction) => updateItem(index, fraction >= 1 ? { outcome: 'processing', progress: 1 } : { progress: fraction }),
      );
      updateItem(index, { outcome: 'created', result: uploaded, message: null, failedScanId: null });
    } catch (err) {
      const apiError = toApiError(err);
      const scanId = (apiError.details as { scan_id?: number } | null)?.scan_id ?? null;
      if (apiError.code === 'duplicate_upload') {
        const existing = existingScanFrom(apiError);
        updateItem(index, { outcome: 'duplicate', message: `Already uploaded${existing ? ` as "${existing.scan_name}"` : ''}; skipped.` });
      } else {
        updateItem(index, { outcome: scanId ? 'failed' : 'rejected', message: apiError.message, failedScanId: scanId });
      }
    }
  };

  const submitBulk = async () => {
    const items: BulkItem[] = files.map((f) => ({ file: f, outcome: 'queued', progress: 0, message: null, result: null, failedScanId: null }));
    setBulkItems(items);
    setPhase('bulk');
    setBulkRunning(true);
    for (let index = 0; index < items.length; index += 1) {
      await uploadOne(index, items[index].file, false);
    }
    setBulkRunning(false);
  };

  const retryDuplicate = async (index: number) => {
    setBulkRunning(true);
    await uploadOne(index, bulkItems[index].file, true);
    setBulkRunning(false);
  };

  const submit = async (allowDuplicate = false) => {
    if (!projectId) {
      setFormError('Select a project.');
      return;
    }
    if (!file) {
      setFormError('Select a report file.');
      return;
    }
    if (isBulk) {
      setFormError(null);
      void submitBulk();
      return;
    }
    setFormError(null);
    setFailure(null);
    setDuplicateOf(null);
    setProgress(0);
    setPhase('uploading');
    try {
      const uploaded = await scanService.upload(
        { projectId: Number(projectId), file, scanName, scanDate: scanDate || undefined, allowDuplicate },
        (fraction) => {
          setProgress(fraction);
          if (fraction >= 1) setPhase('processing');
        },
      );
      setResult(uploaded);
      setPhase('done');
    } catch (err) {
      const apiError = toApiError(err);
      if (apiError.code === 'duplicate_upload') {
        setDuplicateOf(existingScanFrom(apiError));
        setPhase('idle');
        return;
      }
      setFailure(apiError);
      setPhase('failed');
    }
  };

  const reset = () => {
    setFiles([]);
    setBulkItems([]);
    setScanName('');
    setScanDate('');
    setResult(null);
    setFailure(null);
    setPhase('idle');
  };

  if (projects.error || settings.error) {
    return (
      <>
        <PageHeader title="Upload Report" />
        <Card>
          <ErrorState
            message={(projects.error ?? settings.error)!.message}
            onRetry={() => {
              projects.reload();
              settings.reload();
            }}
          />
        </Card>
      </>
    );
  }
  if (!projects.data || !settings.data) {
    return (
      <>
        <PageHeader title="Upload Report" />
        <Card>
          <LoadingState />
        </Card>
      </>
    );
  }

  if (projects.data.total === 0) {
    return (
      <>
        <PageHeader title="Upload Report" />
        <Card>
          <EmptyState
            icon={<FolderKanban className="size-5" aria-hidden />}
            title="No projects yet"
            description="Reports are uploaded to a project. Create a project first."
            action={
              <Link to={NEW_PROJECT_PATH} className={buttonClasses('primary')}>
                <Plus className="size-4" aria-hidden />
                New Project
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  const selectedProject = projects.data.items.find((p) => String(p.id) === projectId);

  return (
    <>
      <PageHeader title="Upload Report" description="Upload a VAPT report. It is validated, parsed and stored with its original file." />

      {phase === 'bulk' ? (
        <Card
          title={`Uploading ${bulkItems.length} reports to ${selectedProject?.name ?? 'the project'}`}
          actions={
            !bulkRunning && (
              <div className="flex gap-2">
                <Link to={projectPath(Number(projectId))} className={buttonClasses('secondary', 'sm')}>
                  View project
                </Link>
                <Button size="sm" onClick={reset}>
                  Upload more reports
                </Button>
              </div>
            )
          }
        >
          <BulkUploadProgress items={bulkItems} running={bulkRunning} onRetryDuplicate={(index) => void retryDuplicate(index)} />
        </Card>
      ) : phase === 'done' && result ? (
        <Card
          title="Analysis summary"
          actions={
            <div className="flex gap-2">
              <Link to={projectPath(result.scan.project_id)} className={buttonClasses('secondary', 'sm')}>
                View project
              </Link>
              <Button size="sm" onClick={reset}>
                Upload another report
              </Button>
            </div>
          }
        >
          <UploadSummary result={result} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <Card title="Report" className="lg:col-span-2">
            <form
              className="space-y-5"
              noValidate
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div>
                <label htmlFor="upload-project" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Project<span className="ml-0.5 text-red-600" aria-hidden>*</span>
                </label>
                <select
                  id="upload-project"
                  value={projectId}
                  disabled={busy}
                  onChange={(event) => setProjectId(event.target.value)}
                  className="block w-full rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-teal-600 focus:outline-none"
                >
                  <option value="">Select a project</option>
                  {projects.data.items.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                {projects.data.total > PROJECT_LIMIT && (
                  <p className="mt-1 text-xs text-slate-500">Showing the first {PROJECT_LIMIT} projects alphabetically.</p>
                )}
              </div>

              <FileDropzone
                files={files}
                accept={settings.data.allowed_extensions}
                maxSizeMb={settings.data.max_upload_size_mb}
                maxFiles={MAX_FILES}
                disabled={busy}
                onChange={(selected) => {
                  setFiles(selected);
                  setFailure(null);
                  if (phase === 'failed') setPhase('idle');
                }}
                onReject={setFileError}
              />
              {fileError && (
                <p role="alert" className="text-sm text-red-700">
                  {fileError}
                </p>
              )}

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <TextField
                  label="Scan name"
                  value={isBulk ? '' : scanName}
                  maxLength={255}
                  disabled={busy || isBulk}
                  placeholder={isBulk ? 'Each report is named after its file' : (file?.name ?? 'Defaults to the file name')}
                  onChange={(event) => setScanName(event.target.value)}
                />
                <TextField
                  label="Scan date"
                  type="date"
                  value={scanDate}
                  disabled={busy}
                  hint="Used only if the report does not contain a date."
                  onChange={(event) => setScanDate(event.target.value)}
                />
              </div>

              {formError && (
                <p role="alert" className="text-sm text-red-700">
                  {formError}
                </p>
              )}

              {busy && (
                <div role="status" aria-live="polite" className="rounded-md bg-slate-50 px-4 py-3">
                  {phase === 'uploading' ? (
                    <>
                      <div className="mb-2 flex justify-between text-sm text-slate-700">
                        <span>Uploading…</span>
                        <span className="tabular-nums">{Math.round(progress * 100)}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full bg-teal-600 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                      </div>
                    </>
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-slate-700">
                      <LoaderCircle className="size-4 animate-spin" aria-hidden />
                      Processing report: detecting format, parsing, normalising, checking duplicates and saving…
                    </p>
                  )}
                </div>
              )}

              {phase === 'failed' && failure && (
                <div role="alert" className="flex items-start gap-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
                  <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
                  <div>
                    <p className="font-medium">The report could not be processed</p>
                    <p>{failure.message}</p>
                    {Boolean((failure.details as { scan_id?: number } | null)?.scan_id) && (
                      <p className="mt-1 text-red-700">
                        The original file was kept and the attempt is listed as a failed scan. No findings were saved.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" loading={busy} disabled={!file || !projectId}>
                  {isBulk ? `Upload ${files.length} reports` : 'Upload and analyse'}
                </Button>
              </div>
            </form>
          </Card>

          <Card title="Supported reports">
            <ul className="space-y-3 text-sm">
              {SUPPORTED_REPORTS.map((report) => (
                <li key={report.scanner}>
                  <p className="font-medium text-slate-900">{report.scanner}</p>
                  <p className="text-slate-500">{report.formats}</p>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
              Only values present in the report are stored. Missing fields are left empty, never guessed. Maximum size{' '}
              {settings.data.max_upload_size_mb} MB.
            </p>
          </Card>
        </div>
      )}

      <Modal
        open={duplicateOf !== null}
        title="This report was already uploaded"
        size="sm"
        onClose={() => setDuplicateOf(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDuplicateOf(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submit(true)}>Upload anyway</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          An identical file was uploaded to <strong className="text-slate-900">{selectedProject?.name}</strong>
          {duplicateOf && (
            <>
              {' '}
              as <strong className="text-slate-900">{duplicateOf.scan_name}</strong> on {formatDateTime(duplicateOf.uploaded_at)}
            </>
          )}
          .
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Uploading it again creates another scan record. Findings are matched by fingerprint, so they will not be duplicated.
        </p>
      </Modal>
    </>
  );
}
