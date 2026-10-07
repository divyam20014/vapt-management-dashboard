import { Link } from 'react-router-dom';
import { formatDate } from '../../utils/format';
import { ROUTES } from '../../utils/routes';
import type { Indicators } from '../../types/dashboard';

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

/** Management indicators. "Active" means Open, In Progress or Reopened. */
export default function IndicatorTiles({ indicators, projectId }: { indicators: Indicators; projectId?: number }) {
  const scope = projectId ? `&project=${projectId}` : '';
  const active = 'status=Open&status=In+Progress&status=Reopened';
  const tiles = [
    { label: 'Active findings', value: String(indicators.active_findings), to: `${ROUTES.findings}?${active}${scope}` },
    { label: 'Active Critical & High', value: String(indicators.active_critical_high), to: `${ROUTES.criticalHigh}?${active}${scope}`, alert: indicators.active_critical_high > 0 },
    { label: 'Active & unassigned', value: String(indicators.unassigned_active), to: `${ROUTES.findings}?${active}&assignee=unassigned${scope}` },
    { label: 'Resolved / closed, last 30 days', value: String(indicators.resolved_last_30_days), to: undefined },
    {
      label: 'Oldest active Critical/High',
      value: indicators.oldest_active_critical_high ? `${daysSince(indicators.oldest_active_critical_high)} days` : '—',
      hint: indicators.oldest_active_critical_high ? `first detected ${formatDate(indicators.oldest_active_critical_high)}` : 'none active',
      to: undefined,
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <div key={tile.label} className={`rounded-lg border bg-white px-4 py-3 shadow-xs ${tile.alert ? 'border-red-200' : 'border-slate-200'}`}>
          <dt className="text-xs font-medium text-slate-500">{tile.label}</dt>
          <dd className={`mt-1 text-xl font-semibold tabular-nums ${tile.alert ? 'text-red-700' : 'text-slate-900'}`} data-testid={`indicator-${tile.label}`}>
            {tile.to ? (
              <Link to={tile.to} className="hover:underline">
                {tile.value}
              </Link>
            ) : (
              tile.value
            )}
          </dd>
          {tile.hint && <p className="text-xs text-slate-500">{tile.hint}</p>}
        </div>
      ))}
    </dl>
  );
}
