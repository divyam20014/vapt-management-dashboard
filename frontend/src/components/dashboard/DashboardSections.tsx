import { Link } from 'react-router-dom';
import { ShieldAlert, ShieldCheck, Upload } from 'lucide-react';
import Card from '../ui/Card';
import { buttonClasses } from '../ui/Button';
import EmptyState from '../states/EmptyState';
import ErrorState from '../states/ErrorState';
import LoadingState from '../states/LoadingState';
import SeverityBarChart from '../charts/SeverityBarChart';
import TrendChart from '../charts/TrendChart';
import { SeverityBadge, FindingStatusBadge } from '../findings/Badges';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useAuth } from '../../hooks/useAuth';
import { dashboardService } from '../../services/dashboardService';
import { PERMISSIONS, SEVERITIES, SEVERITY_COUNT_KEYS, SEVERITY_STYLES } from '../../utils/constants';
import { formatDate, formatNumber } from '../../utils/format';
import { ROUTES, findingPath } from '../../utils/routes';
import type { DashboardSummary } from '../../types/dashboard';

function UploadAction({ projectId }: { projectId?: number }) {
  if (!useAuth().can(PERMISSIONS.reportsUpload)) return null;
  return (
    <Link to={projectId ? `${ROUTES.upload}?project=${projectId}` : ROUTES.upload} className={buttonClasses('primary')}>
      <Upload className="size-4" aria-hidden />
      Upload VAPT Report
    </Link>
  );
}

/** The upload button for empty states; nothing for roles that cannot upload. */
export const uploadAction = (projectId?: number) => <UploadAction projectId={projectId} />;

/** Five severity cards; each links to the filtered findings list. */
export function SeverityCards({ summary, projectId }: { summary: DashboardSummary; projectId?: number }) {
  const scope = projectId ? `&project=${projectId}` : '';
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {SEVERITIES.map((level) => (
        <Link
          key={level}
          to={`${ROUTES.findings}?severity=${level}${scope}`}
          className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-xs transition-colors hover:border-slate-300"
        >
          <p className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className={`size-2 rounded-full ${SEVERITY_STYLES[level].dot}`} aria-hidden />
            {level}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900" data-testid={`severity-${level}`}>
            {formatNumber(summary.findings_by_severity[SEVERITY_COUNT_KEYS[level]])}
          </p>
          <p className="text-xs text-slate-500">{summary.active_by_severity[SEVERITY_COUNT_KEYS[level]]} active</p>
        </Link>
      ))}
    </div>
  );
}

export function SeverityDistributionCard({ summary, projectId }: { summary: DashboardSummary; projectId?: number }) {
  return (
    <Card title="Severity distribution" description="Unique findings, any status">
      {summary.finding_count === 0 ? (
        <EmptyState compact icon={<ShieldCheck className="size-5" aria-hidden />} title="No findings available" description="Upload a VAPT report to see severity totals." action={uploadAction(projectId)} />
      ) : (
        <SeverityBarChart counts={summary.findings_by_severity} />
      )}
    </Card>
  );
}

export function TrendCard({ projectId }: { projectId?: number }) {
  const { data, error, reload } = useApiQuery(() => dashboardService.getTrends(projectId), [projectId]);
  return (
    <Card
      title="Findings over time"
      description={data ? `Discovered (first detection) vs. resolved or closed, per ${data.granularity}` : undefined}
    >
      {error ? (
        <ErrorState title="Trends could not be loaded" message={error.message} onRetry={reload} />
      ) : !data ? (
        <LoadingState label="Loading trends…" />
      ) : data.points.length === 0 ? (
        <EmptyState compact title="No trend data yet" description="Trends appear once findings have been detected." />
      ) : (
        <TrendChart trends={data} />
      )}
    </Card>
  );
}

export function RecentCriticalHighCard({ summary, projectId }: { summary: DashboardSummary; projectId?: number }) {
  return (
    <Card
      title="Recent Critical & High findings"
      description="Most recently first detected"
      bodyClassName={summary.recent_critical_high.length ? '' : 'p-5'}
      actions={
        <Link to={projectId ? `${ROUTES.criticalHigh}?project=${projectId}` : ROUTES.criticalHigh} className="text-sm font-medium text-teal-700 hover:text-teal-800">
          View all
        </Link>
      }
    >
      {summary.recent_critical_high.length === 0 ? (
        <EmptyState compact icon={<ShieldAlert className="size-5" aria-hidden />} title="No Critical or High findings" description="None of the uploaded reports contain Critical or High findings." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {summary.recent_critical_high.map((finding) => (
            <li key={finding.id} className="flex items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <Link to={findingPath(finding.id)} className="block truncate text-sm font-medium text-slate-900 hover:text-teal-700">
                  {finding.normalized_title}
                </Link>
                <p className="truncate text-xs text-slate-500">
                  {[projectId ? null : finding.project_name, finding.endpoint, `first detected ${formatDate(finding.first_detected)}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <SeverityBadge severity={finding.normalized_severity} />
                <FindingStatusBadge status={finding.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function TopTypesCard({ summary }: { summary: DashboardSummary }) {
  const hasCategories = summary.top_categories.length > 0;
  return (
    <Card title="Top vulnerability types" description={hasCategories ? 'By category' : 'By CWE (the uploaded reports provide no categories)'} bodyClassName="">
      {hasCategories ? (
        <ul className="divide-y divide-slate-100">
          {summary.top_categories.map((row) => (
            <li key={row.label} className="flex justify-between px-5 py-2 text-sm">
              <span>{row.label}</span>
              <span className="tabular-nums font-medium">{row.count}</span>
            </li>
          ))}
        </ul>
      ) : summary.top_cwes.length === 0 ? (
        <div className="p-5">
          <EmptyState compact title="No classification data" description="Uploaded reports did not include categories or CWE identifiers." />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {summary.top_cwes.map((row) => {
            const max = summary.top_cwes[0].count;
            return (
              <li key={row.cwe} className="px-5 py-2">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <Link to={`${ROUTES.findings}?q=${encodeURIComponent(row.cwe)}`} className="font-medium text-slate-900 hover:text-teal-700">
                    {row.cwe}
                  </Link>
                  <span className="tabular-nums font-medium text-slate-900">{row.count}</span>
                </div>
                <p className="truncate text-xs text-slate-500">e.g. {row.example_title}</p>
                <div className="mt-1 h-1.5 rounded-full bg-slate-100" aria-hidden>
                  <div className="h-1.5 rounded-full bg-teal-600" style={{ width: `${(row.count / max) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
