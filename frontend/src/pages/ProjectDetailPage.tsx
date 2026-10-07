import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink, FileText, GitCompare, Pencil, ScanLine, Trash, Upload } from 'lucide-react';
import { exportService } from '../services/exportService';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Button, { buttonClasses } from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/states/EmptyState';
import LoadingState from '../components/states/LoadingState';
import ErrorState from '../components/states/ErrorState';
import ProjectStatusBadge from '../components/projects/ProjectStatusBadge';
import ProjectFormModal from '../components/projects/ProjectFormModal';
import ScanList from '../components/scans/ScanList';
import SeverityBreakdown from '../components/scans/SeverityBreakdown';
import IndicatorTiles from '../components/dashboard/IndicatorTiles';
import StatusSummary from '../components/dashboard/StatusSummary';
import { RecentCriticalHighCard, SeverityCards, TrendCard, uploadAction } from '../components/dashboard/DashboardSections';
import { projectService } from '../services/projectService';
import { scanService } from '../services/scanService';
import { dashboardService } from '../services/dashboardService';
import { toApiError } from '../services/api';
import { useApiQuery } from '../hooks/useApiQuery';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../hooks/useAuth';
import { PERMISSIONS } from '../utils/constants';
import { formatDate, formatDateTime } from '../utils/format';
import { ROUTES, comparePath, scanPath } from '../utils/routes';
import type { Project } from '../types/project';
import type { Scan } from '../types/scan';

const NOT_SET = 'Not set';

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const id = Number(projectId);
  const navigate = useNavigate();
  const { can } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const { data: project, loading, error, reload } = useApiQuery(() => projectService.get(id), [id]);
  useDocumentTitle(project?.name ?? 'Project');

  const backLink = (
    <Link to={ROUTES.projects} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
      <ArrowLeft className="size-4" aria-hidden />
      Projects
    </Link>
  );

  if (!Number.isInteger(id) || id <= 0) {
    return (
      <Card>
        <ErrorState title="Project not found" message="The project identifier in the address is not valid." />
      </Card>
    );
  }
  if (error) {
    return (
      <>
        <PageHeader title="Project" breadcrumb={backLink} />
        <Card>
          <ErrorState
            title={error.status === 404 ? 'Project not found' : 'Project could not be loaded'}
            message={error.message}
            onRetry={error.status === 404 ? undefined : reload}
          />
        </Card>
      </>
    );
  }
  if (loading && !project) {
    return (
      <Card>
        <LoadingState label="Loading project…" />
      </Card>
    );
  }
  if (!project) return null;

  const confirmDelete = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await projectService.remove(project.id);
      navigate(ROUTES.projects, { replace: true });
    } catch (err) {
      setDeleteError(toApiError(err).message);
      setDeleteBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        breadcrumb={backLink}
        title={project.name}
        description={project.application_name ?? undefined}
        actions={
          <>
            {can(PERMISSIONS.reportsUpload) && (
              <Link to={`${ROUTES.upload}?project=${project.id}`} className={buttonClasses('primary')}>
                <Upload className="size-4" aria-hidden />
                Upload report
              </Link>
            )}
            <Button
              variant="secondary"
              icon={<FileText className="size-4" aria-hidden />}
              loading={reportBusy}
              onClick={async () => {
                setReportBusy(true);
                setReportError(null);
                try {
                  await exportService.projectReport(project.id);
                } catch (err) {
                  setReportError(toApiError(err).message);
                } finally {
                  setReportBusy(false);
                }
              }}
            >
              Project report
            </Button>
            {can(PERMISSIONS.projectsWrite) && (
              <Button variant="secondary" icon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            )}
            {can(PERMISSIONS.projectsDelete) && (
              <Button
                variant="secondary"
                icon={<Trash className="size-4" aria-hidden />}
                onClick={() => {
                  setDeleteError(null);
                  setDeleteOpen(true);
                }}
              >
                Delete
              </Button>
            )}
          </>
        }
      />

      {reportError && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {reportError}
        </p>
      )}
      <ProjectDashboard project={project} />

      <ProjectFormModal
        open={editOpen}
        project={project}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          reload();
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        title="Delete project"
        message={
          <>
            Permanently delete <strong className="font-semibold text-slate-900">{project.name}</strong>? This cannot be undone.
          </>
        }
        confirmLabel="Delete project"
        busy={deleteBusy}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}

function ProjectDashboard({ project }: { project: Project }) {
  const { data: summary, error, reload } = useApiQuery(() => dashboardService.getSummary(project.id), [project.id]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <Card title="Project details" className="lg:col-span-2">
          <ProjectDetails project={project} />
        </Card>
        <Card title="Latest scan">
          {error ? (
            <ErrorState title="Project data could not be loaded" message={error.message} onRetry={reload} />
          ) : !summary ? (
            <LoadingState />
          ) : summary.latest_scan ? (
            <LatestScan scan={summary.latest_scan} findingCount={summary.finding_count} projectId={project.id} />
          ) : (
            <EmptyState compact icon={<ScanLine className="size-5" aria-hidden />} title="No scans available" description="Upload a VAPT report to this project." action={uploadAction(project.id)} />
          )}
        </Card>
      </div>

      {summary && summary.finding_count > 0 && (
        <>
          <SeverityCards summary={summary} projectId={project.id} />
          <IndicatorTiles indicators={summary.indicators} projectId={project.id} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="Remediation status" description="All findings of this project">
              <StatusSummary summary={summary} projectId={project.id} />
            </Card>
            <RecentCriticalHighCard summary={summary} projectId={project.id} />
          </div>
          <TrendCard projectId={project.id} />
        </>
      )}

      <ProjectScans projectId={project.id} />
    </div>
  );
}

function LatestScan({ scan, findingCount, projectId }: { scan: Scan; findingCount: number; projectId: number }) {
  return (
    <div className="space-y-3 text-sm">
      <div>
        <Link to={scanPath(scan.id)} className="font-medium text-slate-900 hover:text-teal-700">
          {scan.scan_name}
        </Link>
        <p className="text-xs text-slate-500">
          {[scan.scanner, scan.report_type].filter(Boolean).join(' ')} · {formatDateTime(scan.scan_date ?? scan.uploaded_at)}
          {scan.scan_date ? '' : ' (uploaded)'}
        </p>
      </div>
      <p>
        <span className="text-xl font-semibold tabular-nums text-slate-900">{scan.total_findings}</span>{' '}
        <span className="text-slate-500">findings in this scan</span>
      </p>
      <SeverityBreakdown
        counts={{
          critical: scan.critical_count,
          high: scan.high_count,
          medium: scan.medium_count,
          low: scan.low_count,
          informational: scan.informational_count,
        }}
      />
      <p className="border-t border-slate-100 pt-3 text-slate-600">
        <Link to={`${ROUTES.findings}?project=${projectId}`} className="font-medium text-teal-700 hover:text-teal-800">
          {findingCount} findings
        </Link>{' '}
        across all scans of this project
      </p>
    </div>
  );
}

function ProjectScans({ projectId }: { projectId: number }) {
  const { data, error, reload } = useApiQuery(() => scanService.listForProject(projectId, 1, 20), [projectId]);
  const completed = data?.items.filter((scan) => scan.processing_status === 'Completed') ?? [];

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
      <Card
        title="Scan history"
        description="Newest scan date first"
        className="lg:col-span-2"
        bodyClassName={data?.items.length ? '' : 'p-5'}
        actions={
          completed.length >= 2 && (
            <Link to={comparePath(completed[1].id, completed[0].id)} className={buttonClasses('secondary', 'sm')}>
              <GitCompare className="size-4" aria-hidden />
              Compare latest two
            </Link>
          )
        }
      >
        {error ? (
          <ErrorState title="Scans could not be loaded" message={error.message} onRetry={reload} />
        ) : !data ? (
          <LoadingState label="Loading scans…" />
        ) : data.items.length === 0 ? (
          <EmptyState compact icon={<ScanLine className="size-5" aria-hidden />} title="No scans available" description="Upload a VAPT report to this project to create its first scan." />
        ) : (
          <>
            <ScanList scans={data.items} />
            {data.total > data.items.length && (
              <p className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">
                Showing the latest {data.items.length} of {data.total} scans.{' '}
                <Link to={`${ROUTES.scans}?project=${projectId}`} className="font-medium text-teal-700 hover:text-teal-800">
                  View all
                </Link>
              </p>
            )}
          </>
        )}
      </Card>
      <Card title="Uploaded reports" description="Original files, exactly as uploaded" bodyClassName={data?.items.length ? '' : 'p-5'}>
        {!data || data.items.length === 0 ? (
          <EmptyState compact icon={<FileText className="size-5" aria-hidden />} title="No reports available" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((scan) => (
              <li key={scan.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-slate-800" title={scan.original_filename}>
                    {scan.original_filename}
                  </p>
                  <p className="text-xs text-slate-500">uploaded {formatDate(scan.uploaded_at)}</p>
                </div>
                <a
                  href={scanService.originalUrl(scan.id)}
                  download
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
                  aria-label={`Download ${scan.original_filename}`}
                >
                  <Download className="size-3.5" aria-hidden />
                  Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ProjectDetails({ project }: { project: Project }) {
  const rows: { label: string; value: ReactNode }[] = [
    { label: 'Status', value: <ProjectStatusBadge status={project.status} /> },
    { label: 'Environment', value: project.environment ?? NOT_SET },
    { label: 'Application name', value: project.application_name ?? NOT_SET },
    {
      label: 'Application URL',
      value: project.application_url ? (
        <a
          href={project.application_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 break-all text-teal-700 hover:text-teal-800"
        >
          {project.application_url}
          <ExternalLink className="size-3.5 shrink-0" aria-hidden />
        </a>
      ) : (
        NOT_SET
      ),
    },
    { label: 'Owner', value: project.owner ?? NOT_SET },
    { label: 'Created', value: formatDateTime(project.created_at) },
    { label: 'Last updated', value: formatDateTime(project.updated_at) },
  ];

  return (
    <>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{row.label}</dt>
            <dd className="mt-1 text-sm text-slate-900">{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 border-t border-slate-100 pt-4">
        <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase">Description</h3>
        <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700">{project.description ?? NOT_SET}</p>
      </div>
    </>
  );
}
