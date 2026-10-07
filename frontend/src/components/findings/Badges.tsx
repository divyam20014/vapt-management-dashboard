import { FINDING_STATUS_STYLES, SEVERITY_STYLES, UNCLASSIFIED_LABEL, type FindingStatus, type Severity } from '../../utils/constants';

const BASE = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset';

export function SeverityBadge({ severity, original }: { severity: Severity | null; original?: string | null }) {
  if (!severity) {
    return (
      <span className={`${BASE} bg-white text-slate-600 ring-slate-300`} title={original ? `Report severity: ${original}` : undefined}>
        {UNCLASSIFIED_LABEL}
      </span>
    );
  }
  return (
    <span className={`${BASE} ${SEVERITY_STYLES[severity].badge}`}>
      <span className={`size-1.5 rounded-full ${SEVERITY_STYLES[severity].dot}`} aria-hidden />
      {severity}
    </span>
  );
}

export function FindingStatusBadge({ status }: { status: FindingStatus }) {
  return <span className={`${BASE} ${FINDING_STATUS_STYLES[status]}`}>{status}</span>;
}
