import { CircleCheck, TriangleAlert } from 'lucide-react';
import SeverityBreakdown from '../scans/SeverityBreakdown';
import { formatDateTime } from '../../utils/format';
import type { UploadResult } from '../../types/scan';

function Metric({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-md border border-slate-200 px-4 py-3">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</dd>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Analysis summary shown after a report has been processed. */
export default function UploadSummary({ result }: { result: UploadResult }) {
  const { scan } = result;
  return (
    <div className="space-y-6" data-testid="upload-summary">
      <div className="flex items-start gap-3 rounded-md bg-emerald-50 px-4 py-3 text-emerald-800" role="status">
        <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="text-sm">
          <p className="font-medium">Report processed: {scan.scan_name}</p>
          <p className="text-emerald-700">
            Detected as <strong>{result.parser}</strong> ·{' '}
            {scan.scan_date ? `scan date ${formatDateTime(scan.scan_date)}` : 'no scan date in report'} · project{' '}
            {scan.project_name}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Records in report" value={result.records_parsed} />
        <Metric label="Findings in this scan" value={scan.total_findings} hint="After fingerprint de-duplication" />
        <Metric label="New findings" value={result.new_findings} />
        <Metric label="Already known" value={result.existing_findings} hint="Seen in earlier uploads" />
      </dl>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Severity (this scan)</h3>
        <SeverityBreakdown counts={result.severity_counts} size="md" />
        {result.severity_counts.unclassified > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Unclassified findings have a report severity that does not map to Critical, High, Medium, Low or Informational. The
            original value is kept.
          </p>
        )}
      </div>

      {result.warnings.length > 0 && (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="mb-1 flex items-center gap-2 font-medium">
            <TriangleAlert className="size-4" aria-hidden />
            Notes
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-slate-900">Potential duplicates ({result.potential_duplicates.length})</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Findings from different tools that may describe the same issue. They are recorded for review and were not merged.
        </p>
        {result.potential_duplicates.length > 0 && (
          <div className="relative mt-3 overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2">New finding</th>
                  <th scope="col" className="px-4 py-2">Possible match</th>
                  <th scope="col" className="px-4 py-2">Confidence</th>
                  <th scope="col" className="px-4 py-2">Why</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.potential_duplicates.map((duplicate) => (
                  <tr key={`${duplicate.finding_id}-${duplicate.candidate_finding_id}`}>
                    <td className="px-4 py-2">
                      <p className="font-medium text-slate-900">{duplicate.finding_title}</p>
                      <p className="text-xs text-slate-500">{duplicate.finding_source}</p>
                    </td>
                    <td className="px-4 py-2">
                      <p className="font-medium text-slate-900">{duplicate.candidate_title}</p>
                      <p className="text-xs text-slate-500">{duplicate.candidate_source}</p>
                    </td>
                    <td className="px-4 py-2 text-slate-700">{duplicate.confidence}</td>
                    <td className="px-4 py-2 text-xs text-slate-600">{duplicate.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
