import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Pencil, ScanLine, ShieldCheck, Trash } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/states/EmptyState';
import LoadingState from '../components/states/LoadingState';
import ErrorState from '../components/states/ErrorState';
import ProjectStatusBadge from '../components/projects/ProjectStatusBadge';
import ProjectFormModal from '../components/projects/ProjectFormModal';
import { projectService } from '../services/projectService';
import { toApiError } from '../services/api';
import { useApiQuery } from '../hooks/useApiQuery';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatDateTime } from '../utils/format';
import { ROUTES } from '../utils/routes';
import type { Project } from '../types/project';

const NOT_SET = 'Not set';

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const id = Number(projectId);
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
            <Button variant="secondary" icon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditOpen(true)}>
              Edit
            </Button>
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
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <Card title="Project details" className="lg:col-span-2">
          <ProjectDetails project={project} />
        </Card>
        <div className="space-y-6">
          <Card title="Scans">
            <EmptyState
              compact
              icon={<ScanLine className="size-5" aria-hidden />}
              title="No scans available"
              description="Scans for this project will be listed here once report upload is available."
            />
          </Card>
          <Card title="Findings">
            <EmptyState
              compact
              icon={<ShieldCheck className="size-5" aria-hidden />}
              title="No findings available"
              description="Findings are created only from uploaded VAPT reports."
            />
          </Card>
        </div>
      </div>

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
