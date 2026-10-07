import { Link } from 'react-router-dom';
import { Activity, FolderKanban, FolderOpen, Plus, ScanLine, ShieldCheck } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import { buttonClasses } from '../components/ui/Button';
import StatCard from '../components/dashboard/StatCard';
import CountBarChart from '../components/charts/CountBarChart';
import EmptyState from '../components/states/EmptyState';
import LoadingState from '../components/states/LoadingState';
import ErrorState from '../components/states/ErrorState';
import ProjectStatusBadge from '../components/projects/ProjectStatusBadge';
import { dashboardService } from '../services/dashboardService';
import { useApiQuery } from '../hooks/useApiQuery';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PROJECT_STATUSES } from '../utils/constants';
import { formatDate } from '../utils/format';
import { NEW_PROJECT_PATH, projectPath } from '../utils/routes';
import type { DashboardSummary } from '../types/dashboard';

function countFor(summary: DashboardSummary, status: string) {
  return summary.projects_by_status.find((row) => row.label === status)?.count ?? 0;
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { data: summary, loading, error, reload } = useApiQuery(() => dashboardService.getSummary(), []);

  return (
    <>
      <PageHeader title="Dashboard" description="Overview of projects and VAPT activity, calculated from stored data." />

      {loading && !summary && (
        <Card>
          <LoadingState label="Loading dashboard…" />
        </Card>
      )}
      {error && (
        <Card>
          <ErrorState title="Dashboard could not be loaded" message={error.message} onRetry={reload} />
        </Card>
      )}
      {summary && !error && <DashboardContent summary={summary} />}
    </>
  );
}

function DashboardContent({ summary }: { summary: DashboardSummary }) {
  if (summary.project_count === 0) {
    return (
      <Card>
        <EmptyState
          icon={<FolderKanban className="size-5" aria-hidden />}
          title="No projects yet"
          description="Create a project for each application you test. Dashboard metrics are calculated from your stored projects, scans and findings."
          action={
            <Link to={NEW_PROJECT_PATH} className={buttonClasses('primary')}>
              <Plus className="size-4" aria-hidden />
              New Project
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Projects" value={summary.project_count} icon={<FolderKanban className="size-5" aria-hidden />} />
        {PROJECT_STATUSES.map((status) => (
          <StatCard
            key={status}
            label={`${status} projects`}
            value={countFor(summary, status)}
            icon={<Activity className="size-5" aria-hidden />}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Findings by severity" description="Critical, High, Medium, Low and Informational totals">
          <EmptyState
            compact
            icon={<ShieldCheck className="size-5" aria-hidden />}
            title="No findings available"
            description="Severity totals, trends and top categories appear here once VAPT reports have been uploaded and parsed. Report upload is not available yet."
          />
        </Card>
        <Card title="Recent scans" description="Latest uploaded VAPT reports">
          <EmptyState
            compact
            icon={<ScanLine className="size-5" aria-hidden />}
            title="No scans available"
            description="Each uploaded report creates a scan record. Report upload is not available yet."
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Projects by environment">
          <CountBarChart data={summary.projects_by_environment} valueLabel="Projects" />
        </Card>
        <Card title="Projects by status">
          <CountBarChart data={summary.projects_by_status} valueLabel="Projects" />
        </Card>
      </div>

      <Card
        title="Recently created projects"
        bodyClassName=""
        actions={
          <Link to="/projects" className="text-sm font-medium text-teal-700 hover:text-teal-800">
            View all
          </Link>
        }
      >
        <ul className="divide-y divide-slate-100">
          {summary.recent_projects.map((project) => (
            <li key={project.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FolderOpen className="size-4 shrink-0 text-slate-400" aria-hidden />
                <div className="min-w-0">
                  <Link to={projectPath(project.id)} className="block truncate text-sm font-medium text-slate-900 hover:text-teal-700">
                    {project.name}
                  </Link>
                  <p className="truncate text-xs text-slate-500">
                    {[project.application_name, project.environment].filter(Boolean).join(' · ') || 'No application details'}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span className="hidden text-xs text-slate-500 sm:inline">{formatDate(project.created_at)}</span>
                <ProjectStatusBadge status={project.status} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
