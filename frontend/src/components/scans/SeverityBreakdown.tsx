import { SEVERITIES, SEVERITY_COUNT_KEYS, SEVERITY_STYLES, UNCLASSIFIED_LABEL } from '../../utils/constants';
import { formatNumber } from '../../utils/format';

export interface SeverityCountsLike {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
  unclassified?: number;
}

/** Compact per-severity counts, e.g. for scan rows and upload summaries. */
export default function SeverityBreakdown({ counts, size = 'sm' }: { counts: SeverityCountsLike; size?: 'sm' | 'md' }) {
  const text = size === 'md' ? 'text-sm' : 'text-xs';
  return (
    <ul className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${text} text-slate-600`} aria-label="Findings by severity">
      {SEVERITIES.map((severity) => (
        <li key={severity} className="inline-flex items-center gap-1.5" title={severity}>
          <span className={`size-2 rounded-full ${SEVERITY_STYLES[severity].dot}`} aria-hidden />
          <span className="sr-only">{severity}:</span>
          <span className="tabular-nums font-medium text-slate-900">{formatNumber(counts[SEVERITY_COUNT_KEYS[severity]])}</span>
          {size === 'md' && <span>{severity}</span>}
        </li>
      ))}
      {Boolean(counts.unclassified) && (
        <li className="inline-flex items-center gap-1.5" title={UNCLASSIFIED_LABEL}>
          <span className="size-2 rounded-full border border-slate-400" aria-hidden />
          <span className="sr-only">{UNCLASSIFIED_LABEL}:</span>
          <span className="tabular-nums font-medium text-slate-900">{formatNumber(counts.unclassified ?? 0)}</span>
          {size === 'md' && <span>{UNCLASSIFIED_LABEL}</span>}
        </li>
      )}
    </ul>
  );
}
