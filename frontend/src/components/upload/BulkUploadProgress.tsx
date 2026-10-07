import { Link } from 'react-router-dom';
import { CircleAlert, CircleCheck, Copy, LoaderCircle, OctagonX, Clock } from 'lucide-react';
import Button from '../ui/Button';
import { scanPath } from '../../utils/routes';
import type { UploadResult } from '../../types/scan';

export type BulkOutcome = 'queued' | 'uploading' | 'processing' | 'created' | 'duplicate' | 'failed' | 'rejected';

export interface BulkItem {
  file: File;
  outcome: BulkOutcome;
  progress: number;
  message: string | null;
  result: UploadResult | null;
  failedScanId: number | null;
}

const LABELS: Record<BulkOutcome, string> = {
  queued: 'Waiting',
  uploading: 'Uploading',
  processing: 'Processing',
  created: 'Imported',
  duplicate: 'Already uploaded',
  failed: 'Could not be processed',
  rejected: 'Rejected',
};

function Icon({ outcome }: { outcome: BulkOutcome }) {
  if (outcome === 'uploading' || outcome === 'processing') return <LoaderCircle className="size-4 animate-spin text-teal-700" aria-hidden />;
  if (outcome === 'created') return <CircleCheck className="size-4 text-emerald-600" aria-hidden />;
  if (outcome === 'duplicate') return <Copy className="size-4 text-amber-600" aria-hidden />;
  if (outcome === 'failed') return <CircleAlert className="size-4 text-red-600" aria-hidden />;
  if (outcome === 'rejected') return <OctagonX className="size-4 text-red-600" aria-hidden />;
  return <Clock className="size-4 text-slate-400" aria-hidden />;
}

interface BulkUploadProgressProps {
  items: BulkItem[];
  running: boolean;
  onRetryDuplicate: (index: number) => void;
}

/** Per-file status of a multi-file upload, plus the batch summary once every file is done. */
export default function BulkUploadProgress({ items, running, onRetryDuplicate }: BulkUploadProgressProps) {
  const done = items.filter((item) => !['queued', 'uploading', 'processing'].includes(item.outcome)).length;
  const succeeded = items.filter((item) => item.outcome === 'created').length;
  const duplicates = items.filter((item) => item.outcome === 'duplicate').length;
  const failed = items.filter((item) => item.outcome === 'failed' || item.outcome === 'rejected').length;
  const added = items.reduce((sum, item) => sum + (item.result?.new_findings ?? 0), 0);

  return (
    <div className="space-y-4">
      <div role="status" aria-live="polite" className="text-sm text-slate-700">
        {running ? `Processing report ${Math.min(done + 1, items.length)} of ${items.length}…` : `All ${items.length} reports processed.`}
      </div>
      {!running && (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="bulk-summary">
          {[
            ['Succeeded', succeeded],
            ['Failed', failed],
            ['Duplicates', duplicates],
            ['Findings added', added],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-slate-200 px-4 py-3">
              <dt className="text-xs font-medium text-slate-500">{label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <ul className="divide-y divide-slate-100 rounded-md border border-slate-200" aria-label="Upload status per file">
        {items.map((item, index) => (
          <li key={`${item.file.name}-${index}`} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-2">
              <span className="mt-0.5">
                <Icon outcome={item.outcome} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{item.file.name}</p>
                <p className="text-xs text-slate-600">
                  {LABELS[item.outcome]}
                  {item.outcome === 'uploading' && ` ${Math.round(item.progress * 100)}%`}
                  {item.result && ` · ${item.result.parser} · ${item.result.records_parsed} records, ${item.result.new_findings} new findings`}
                </p>
                {item.message && <p className={`text-xs ${item.outcome === 'duplicate' ? 'text-amber-700' : 'text-red-700'}`}>{item.message}</p>}
                {item.result?.warnings.map((warning) => (
                  <p key={warning} className="text-xs text-amber-700">
                    {warning}
                  </p>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 pl-6 sm:pl-0">
              {item.result && (
                <Link to={scanPath(item.result.scan.id)} className="text-xs font-medium text-teal-700 hover:text-teal-800">
                  View scan
                </Link>
              )}
              {item.failedScanId && (
                <Link to={scanPath(item.failedScanId)} className="text-xs font-medium text-teal-700 hover:text-teal-800">
                  View failed scan
                </Link>
              )}
              {item.outcome === 'duplicate' && !running && (
                <Button size="sm" variant="secondary" onClick={() => onRetryDuplicate(index)}>
                  Upload anyway
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
