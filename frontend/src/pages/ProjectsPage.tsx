import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, FolderKanban, Pencil, Plus, Search, Trash } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Pagination from '../components/ui/Pagination';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/states/EmptyState';
import LoadingState from '../components/states/LoadingState';
import ErrorState from '../components/states/ErrorState';
import ProjectStatusBadge from '../components/projects/ProjectStatusBadge';
import ProjectFormModal from '../components/projects/ProjectFormModal';
import { projectService } from '../services/projectService';
import { toApiError } from '../services/api';
import { useApiQuery } from '../hooks/useApiQuery';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { DEFAULT_PAGE_SIZE, PROJECT_ENVIRONMENTS, PROJECT_STATUSES, type ProjectEnvironment, type ProjectStatus } from '../utils/constants';
import { formatDate } from '../utils/format';
import { projectPath } from '../utils/routes';
import type { Project, ProjectSortField } from '../types/project';

const FILTER_CLASS =
  'rounded-md border-0 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-teal-600 focus:outline-none';

export default function ProjectsPage() {
  useDocumentTitle('Projects');
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProjectStatus | ''>('');
  const [environment, setEnvironment] = useState<ProjectEnvironment | ''>('');
  const [sortBy, setSortBy] = useState<ProjectSortField>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim());

  const createOpen = searchParams.get('new') === '1';
  const setCreateOpen = (open: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (open) next.set('new', '1');
    else next.delete('new');
    setSearchParams(next, { replace: true });
  };

  const { data, loading, error, reload } = useApiQuery(
    () =>
      projectService.list({
        page,
        page_size: DEFAULT_PAGE_SIZE,
        search: debouncedSearch || undefined,
        status: status || undefined,
        environment: environment || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      }),
    [page, debouncedSearch, status, environment, sortBy, sortOrder],
  );

  const hasFilters = Boolean(debouncedSearch || status || environment);

  const changeSort = (field: ProjectSortField) => {
    if (field === sortBy) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else {
      setSortBy(field);
      setSortOrder(field === 'name' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await projectService.remove(deleting.id);
      setDeleting(null);
      if (data && data.items.length === 1 && page > 1) setPage(page - 1);
      else reload();
    } catch (err) {
      setDeleteError(toApiError(err).message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const sortHeader = (field: ProjectSortField, label: string) => {
    const active = sortBy === field;
    const Icon = sortOrder === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th scope="col" aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-5 py-3 text-left">
        <button type="button" onClick={() => changeSort(field)} className="inline-flex items-center gap-1 hover:text-slate-900">
          {label}
          {active && <Icon className="size-3.5" aria-hidden />}
        </button>
      </th>
    );
  };

  return (
    <>
      <PageHeader
        title="Projects"
        description="Applications under VAPT management."
        actions={
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setCreateOpen(true)}>
            New Project
          </Button>
        }
      />

      <Card bodyClassName="">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by name, application, owner or description"
              aria-label="Search projects"
              className="block w-full rounded-md border-0 bg-white py-2 pr-3 pl-9 text-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-600 focus:outline-none"
            />
          </div>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ProjectStatus | '');
              setPage(1);
            }}
            className={FILTER_CLASS}
          >
            <option value="">All statuses</option>
            {PROJECT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by environment"
            value={environment}
            onChange={(event) => {
              setEnvironment(event.target.value as ProjectEnvironment | '');
              setPage(1);
            }}
            className={FILTER_CLASS}
          >
            <option value="">All environments</option>
            {PROJECT_ENVIRONMENTS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <ErrorState title="Projects could not be loaded" message={error.message} onRetry={reload} />
        ) : !data ? (
          <LoadingState label="Loading projects…" />
        ) : data.total === 0 ? (
          hasFilters ? (
            <EmptyState title="No matching projects" description="No projects match the current search and filters." />
          ) : (
            <EmptyState
              icon={<FolderKanban className="size-5" aria-hidden />}
              title="No projects yet"
              description="Create your first project to start managing its VAPT reports."
              action={
                <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setCreateOpen(true)}>
                  New Project
                </Button>
              }
            />
          )
        ) : (
          <>
            <div className={`relative overflow-x-auto ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs font-medium tracking-wide text-slate-500 uppercase">
                  <tr>
                    {sortHeader('name', 'Project')}
                    {sortHeader('environment', 'Environment')}
                    <th scope="col" className="px-5 py-3 text-left">Owner</th>
                    {sortHeader('status', 'Status')}
                    {sortHeader('created_at', 'Created')}
                    {sortHeader('updated_at', 'Updated')}
                    <th scope="col" className="px-5 py-3 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((project) => (
                    <tr key={project.id} className="hover:bg-slate-50">
                      <td className="max-w-xs px-5 py-3">
                        <Link to={projectPath(project.id)} className="block truncate font-medium text-slate-900 hover:text-teal-700">
                          {project.name}
                        </Link>
                        {project.application_name && <p className="truncate text-xs text-slate-500">{project.application_name}</p>}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{project.environment ?? '—'}</td>
                      <td className="max-w-[12rem] truncate px-5 py-3 text-slate-600">{project.owner ?? '—'}</td>
                      <td className="px-5 py-3">
                        <ProjectStatusBadge status={project.status} />
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-slate-600">{formatDate(project.created_at)}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-slate-600">{formatDate(project.updated_at)}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setEditing(project)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label={`Edit ${project.name}`}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleting(project);
                          }}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Delete ${project.name}`}
                        >
                          <Trash className="size-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={setPage} />
          </>
        )}
      </Card>

      <ProjectFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          setPage(1);
          reload();
        }}
      />
      <ProjectFormModal
        open={editing !== null}
        project={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete project"
        message={
          <>
            Permanently delete <strong className="font-semibold text-slate-900">{deleting?.name}</strong>? This cannot be undone.
          </>
        }
        confirmLabel="Delete project"
        busy={deleteBusy}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
