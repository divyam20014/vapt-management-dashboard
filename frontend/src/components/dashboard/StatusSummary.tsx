import { Link } from 'react-router-dom';
import { FINDING_STATUS_STYLES } from '../../utils/constants';
import { ROUTES } from '../../utils/routes';
import type { DashboardSummary } from '../../types/dashboard';

const GROUPS = [
  { label: 'Needs action', statuses: ['Open', 'In Progress', 'Reopened'], bar: 'bg-orange-500' },
  { label: 'Fixed', statuses: ['Resolved', 'Closed'], bar: 'bg-teal-600' },
  { label: 'Exceptions', statuses: ['Accepted Risk', 'False Positive'], bar: 'bg-slate-400' },
] as const;

/** Remediation status breakdown. Every count links to the matching findings list. */
export default function StatusSummary({ summary, projectId }: { summary: DashboardSummary; projectId?: number }) {
  const counts = Object.fromEntries(summary.status_summary.map((row) => [row.status, row.count]));
  const total = summary.finding_count;
  const scope = projectId ? `&project=${projectId}` : '';

  return (
    <div className="space-y-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        {GROUPS.map((group) => {
          const value = group.statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
          return total ? <div key={group.label} className={group.bar} style={{ width: `${(value / total) * 100}%` }} /> : null;
        })}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {GROUPS.map((group) => {
          const value = group.statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
          return (
            <div key={group.label}>
              <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
                <span className={`size-2 rounded-full ${group.bar}`} aria-hidden />
                {group.label}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900" data-testid={`status-group-${group.label}`}>
                {value}
                {total > 0 && <span className="ml-1 text-xs font-normal text-slate-500">({Math.round((value / total) * 100)}%)</span>}
              </p>
              <ul className="mt-1 space-y-1">
                {group.statuses.map((status) => (
                  <li key={status} className="flex items-center justify-between text-sm">
                    <Link
                      to={`${ROUTES.findings}?status=${encodeURIComponent(status)}${scope}`}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${FINDING_STATUS_STYLES[status]}`}
                    >
                      {status}
                    </Link>
                    <span className="tabular-nums text-slate-700">{counts[status] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
