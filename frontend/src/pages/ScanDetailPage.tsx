import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DeleteRecordButton from '../components/auth/DeleteRecordButton';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, GitCompare } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import { buttonClasses } from '../components/ui/Button';
import LoadingState from '../components/states/LoadingState';
import ErrorState from '../components/states/ErrorState';
import ScanStatusBadge from '../components/scans/ScanStatusBadge';
import SeverityBreakdown from '../components/scans/SeverityBreakdown';
import FindingsWorkspace from '../components/findings/FindingsWorkspace';
import { scanService } from '../services/scanService';
import { useApiQuery } from '../hooks/useApiQuery';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { NOT_PROVIDED } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import { ROUTES, comparePath, projectPath, scanPath } from '../utils/routes';

export default function ScanDetailPage() {
  const id = Number(useParams().scanId);
  const navigate = useNavigate();
  const { data: scan, error, reload } = useApiQuery(() => scanService.get(id), [id]);
  useDocumentTitle(scan?.scan_name ?? 'Scan');

  const back = (
    <Link to={ROUTES.scans} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
      <ArrowLeft className="size-4" aria-hidden />
      Scans
    </Link>
  );

  if (error) {
    return (
      <>
        <PageHeader title="Scan" breadcrumb={back} />
        <Card>
          <ErrorState title={error.status === 404 ? 'Scan not found' : 'Scan could not be loaded'} message={error.message} onRetry={error.status === 404 ? undefined : reload} />
        </Card>
      </>
    );
  }
  if (!scan) {
    return (
      <Card>
        <LoadingState label="Loading scan…" />
      </Card>
    );
  }

  const facts: [string, ReactNode][] = [
    ['Project', <Link to={projectPath(scan.project_id)} className="text-teal-700 hover:text-teal-800">{scan.project_name}</Link>],
    ['Scanner', scan.scanner ?? 'Not identified'],
    ['Report format', scan.report_type ?? 'Not identified'],
    ['Original file', <span className="font-mono text-xs break-all">{scan.original_filename}</span>],
    ['Scan date', scan.scan_date ? formatDateTime(scan.scan_date) : <span className="text-slate-400 italic">{NOT_PROVIDED} in report</span>],
    ['Uploaded', formatDateTime(scan.uploaded_at)],
  ];

  return (
    <>
      <PageHeader
        breadcrumb={back}
        title={scan.scan_name}
        description={`${scan.project_name} · ${[scan.scanner, scan.report_type].filter(Boolean).join(' ')}`}
        actions={
          <>
            <a href={scanService.originalUrl(scan.id)} className={buttonClasses('secondary')} download>
              <Download className="size-4" aria-hidden />
              Original report
            </a>
            {scan.previous_scan && (
              <Link to={comparePath(scan.previous_scan.id, scan.id)} className={buttonClasses('primary')}>
                <GitCompare className="size-4" aria-hidden />
                Compare with previous scan
              </Link>
            )}
            <DeleteRecordButton
              label="Delete scan"
              title="Delete scan"
              message={
                <>
                  <strong>{scan.scan_name}</strong> and its original file ({scan.original_filename}) will be deleted. Findings that no other
                  scan observed are removed; findings also seen in other scans are kept with their status and history, and their detection
                  dates are recalculated. This cannot be undone and is recorded in the audit log.
                </>
              }
              onDelete={() => scanService.remove(scan.id)}
              onDeleted={() => navigate(projectPath(scan.project_id))}
            />
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <Card title="Scan" className="lg:col-span-2">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</dt>
                <dd className="mt-1 text-sm text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title="Result">
          <div className="space-y-3">
            <ScanStatusBadge status={scan.processing_status} />
            {scan.processing_status === 'Failed' ? (
              <p className="text-sm text-red-700">{scan.processing_error}</p>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums text-slate-900">
                  {scan.total_findings} <span className="text-sm font-normal text-slate-500">findings in this scan</span>
                </p>
                <SeverityBreakdown
                  size="md"
                  counts={{
                    critical: scan.critical_count,
                    high: scan.high_count,
                    medium: scan.medium_count,
                    low: scan.low_count,
                    informational: scan.informational_count,
                  }}
                />
              </>
            )}
            <nav className="flex justify-between border-t border-slate-100 pt-3 text-sm" aria-label="Neighbouring scans">
              {scan.previous_scan ? (
                <Link to={scanPath(scan.previous_scan.id)} className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-800">
                  <ChevronLeft className="size-4" aria-hidden />
                  Previous
                </Link>
              ) : (
                <span className="text-slate-400">No earlier scan</span>
              )}
              {scan.next_scan ? (
                <Link to={scanPath(scan.next_scan.id)} className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-800">
                  Next
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              ) : (
                <span className="text-slate-400">Latest scan</span>
              )}
            </nav>
          </div>
        </Card>
      </div>

      {scan.processing_status === 'Completed' && (
        <section className="mt-6" aria-label="Findings in this scan">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Findings in this scan</h2>
          <FindingsWorkspace scanId={scan.id} emptyTitle="No findings in this scan" />
        </section>
      )}
    </>
  );
}
