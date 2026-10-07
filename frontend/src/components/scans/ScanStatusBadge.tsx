import type { ScanStatus } from '../../utils/constants';

const STYLES: Record<ScanStatus, string> = {
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Failed: 'bg-red-50 text-red-700 ring-red-600/20',
};

export default function ScanStatusBadge({ status }: { status: ScanStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}>
      {status}
    </span>
  );
}
