import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import ScanStatusBadge from './ScanStatusBadge';
import SeverityBreakdown from './SeverityBreakdown';
import { formatDateTime } from '../../utils/format';
import { projectPath } from '../../utils/routes';
import type { Scan } from '../../types/scan';

interface ScanListProps {
  scans: Scan[];
  showProject?: boolean;
}

/** Scan rows: report identity, dates, processing status and severity totals (or the failure reason). */
export default function ScanList({ scans, showProject = false }: ScanListProps) {
  return (
    <ul className="divide-y divide-slate-100">
      {scans.map((scan) => (
        <li key={scan.id} className="px-5 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <FileText className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900" title={scan.original_filename}>
                  {scan.scan_name}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {showProject && (
                    <>
                      <Link to={projectPath(scan.project_id)} className="text-teal-700 hover:text-teal-800">
                        {scan.project_name}
                      </Link>
                      {' · '}
                    </>
                  )}
                  {[scan.scanner, scan.report_type].filter(Boolean).join(' ') || 'Report type not identified'}
                  {' · '}
                  {scan.scan_date ? `Scanned ${formatDateTime(scan.scan_date)}` : `Uploaded ${formatDateTime(scan.uploaded_at)}`}
                </p>
              </div>
            </div>
            <ScanStatusBadge status={scan.processing_status} />
          </div>
          <div className="mt-2 pl-7">
            {scan.processing_status === 'Failed' ? (
              <p className="text-xs text-red-700">{scan.processing_error}</p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-xs text-slate-500">
                  <span className="font-medium text-slate-900 tabular-nums">{scan.total_findings}</span> findings
                </span>
                <SeverityBreakdown
                  counts={{
                    critical: scan.critical_count,
                    high: scan.high_count,
                    medium: scan.medium_count,
                    low: scan.low_count,
                    informational: scan.informational_count,
                  }}
                />
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
