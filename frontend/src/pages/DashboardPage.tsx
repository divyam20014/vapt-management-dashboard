import { Link } from 'react-router-dom';
import { FolderKanban, Plus, ScanLine, ShieldAlert, ShieldCheck } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import { buttonClasses } from '../components/ui/Button';
import StatCard from '../components/dashboard/StatCard';
import IndicatorTiles from '../components/dashboard/IndicatorTiles';
import StatusSummary from '../components/dashboard/StatusSummary';
import {
  RecentCriticalHighCard,
  SeverityCards,
  SeverityDistributionCard,
  TopTypesCard,
  TrendCard,
  uploadAction,
} from '../components/dashboard/DashboardSections';
import ProjectSeverityChart from '../components/charts/ProjectSeverityChart';
import ScanList from '../components/scans/ScanList';
import EmptyState from '../components/states/EmptyState';
import LoadingState from '../components/states/LoadingState';
import ErrorState from '../components/states/ErrorState';
import { dashboardService } from '../services/dashboardService';
import { useApiQuery } from '../hooks/useApiQuery';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../hooks/useAuth';
import { PERMISSIONS } from '../utils/constants';
import { NEW_PROJECT_PATH, ROUTES } from '../utils/routes';
import type { DashboardSummary } from '../types/dashboard';

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { data: summary, loading, error, reload } = useApiQuery(() => dashboardService.getSummary(), []);

  return (
    <>
      <PageHeader title="Dashboard" description="Portfolio overview. Every number is calculated from stored projects, scans and findings." />
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

function NewProjectAction() {
  if (!useAuth().can(PERMISSIONS.projectsWrite)) return null;
  return (
    <Link to={NEW_PROJECT_PATH} className={buttonClasses('primary')}>
      <Plus className="size-4" aria-hidden />
      New Project
    </Link>
  );
}

function DashboardContent({ summary }: { summary: DashboardSummary }) {
  if (summary.project_count === 0) {
    return (
      <Card>
        <EmptyState
          icon={<FolderKanban className="size-5" aria-hidden />}
          title="No projects yet"
          description="Create a project for each application you test, then upload its VAPT reports. Dashboard metrics are calculated from that data."
          action={<NewProjectAction />}
        />
      </Card>
    );
  }

  const severity = summary.findings_by_severity;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Projects" value={summary.project_count} icon={<FolderKanban className="size-5" aria-hidden />} />
        <StatCard
          label="Scans"
          value={summary.scan_count}
          icon={<ScanLine className="size-5" aria-hidden />}
          hint={summary.failed_scan_count ? `${summary.failed_scan_count} failed upload(s) not counted` : undefined}
        />
        <StatCard label="Findings" value={summary.finding_count} icon={<ShieldCheck className="size-5" aria-hidden />} />
        <StatCard label="Critical & High" value={severity.critical + severity.high} icon={<ShieldAlert className="size-5" aria-hidden />} />
      </div>

      {summary.finding_count > 0 && (
        <>
          <SeverityCards summary={summary} />
          <IndicatorTiles indicators={summary.indicators} />
        </>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SeverityDistributionCard summary={summary} />
        <Card title="Remediation status" description="All findings by workflow status">
          {summary.finding_count === 0 ? (
            <EmptyState compact title="No findings available" description="Status tracking starts once findings exist." />
          ) : (
            <StatusSummary summary={summary} />
          )}
        </Card>
      </div>

      <TrendCard />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Findings by project" description="Top 10 projects by number of findings">
          {summary.findings_by_project.length === 0 ? (
            <EmptyState compact title="No findings available" description="Projects appear here once their reports contain findings." />
          ) : (
            <ProjectSeverityChart rows={summary.findings_by_project} />
          )}
        </Card>
        <TopTypesCard summary={summary} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentCriticalHighCard summary={summary} />
        <Card
          title="Recent scans"
          description="Newest scan date first"
          bodyClassName={summary.recent_scans.length ? '' : 'p-5'}
          actions={
            <Link to={ROUTES.scans} className="text-sm font-medium text-teal-700 hover:text-teal-800">
              View all
            </Link>
          }
        >
          {summary.recent_scans.length === 0 ? (
            <EmptyState compact icon={<ScanLine className="size-5" aria-hidden />} title="No scans available" description="Each uploaded report creates a scan record." action={uploadAction()} />
          ) : (
            <ScanList scans={summary.recent_scans} showProject />
          )}
        </Card>
      </div>
    </div>
  );
}
