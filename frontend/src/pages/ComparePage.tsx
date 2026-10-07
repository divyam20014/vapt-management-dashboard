import { listProjectOptions } from '../services/projectOptions';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, GitCompare, TriangleAlert } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import EmptyState from '../components/states/EmptyState';
import LoadingState from '../components/states/LoadingState';
import ErrorState from '../components/states/ErrorState';
import { FindingStatusBadge, SeverityBadge } from '../components/findings/Badges';
import { scanService } from '../services/scanService';
import { useApiQuery } from '../hooks/useApiQuery';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { CLASSIFICATIONS, CLASSIFICATION_STYLES } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import { ROUTES, findingPath, projectPath, scanPath } from '../utils/routes';
import type { Classification, ComparisonResult } from '../types/comparison';
import type { Scan } from '../types/scan';

const SELECT =
  'block w-full rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-teal-600 focus:outline-none';

const scanLabel = (scan: Scan) => `${scan.scan_name} — ${formatDateTime(scan.scan_date ?? scan.uploaded_at)}${scan.scan_date ? '' : ' (uploaded)'}`;

function ScanPicker({ onPick }: { onPick: (base: number, compare: number) => void }) {
  const [params] = useSearchParams();
  const projects = useApiQuery(() => listProjectOptions(), []);
  const [projectId, setProjectId] = useState(params.get('project') ?? '');
  const scans = useApiQuery(
    () =>
      projectId
        ? scanService.list({ page: 1, page_size: 100, project_id: [Number(projectId)], status: ['Completed'] })
        : Promise.resolve(null),
    [projectId],
  );
  const [base, setBase] = useState('');
  const [current, setCurrent] = useState('');

  useEffect(() => {
    const items = scans.data?.items ?? [];
    setCurrent(items[0] ? String(items[0].id) : '');
    setBase(items[1] ? String(items[1].id) : '');
  }, [scans.data]);

  const items = scans.data?.items ?? [];
  return (
    <Card title="Choose scans" description="Compare a baseline (previous) scan with a current scan of the same project.">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto_1fr_auto] md:items-end">
        <div>
          <label htmlFor="compare-project" className="mb-1.5 block text-sm font-medium text-slate-700">Project</label>
          <select id="compare-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={SELECT}>
            <option value="">Select a project</option>
            {(projects.data?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="compare-base" className="mb-1.5 block text-sm font-medium text-slate-700">Baseline (previous)</label>
          <select id="compare-base" value={base} disabled={!items.length} onChange={(e) => setBase(e.target.value)} className={SELECT}>
            <option value="">Select a scan</option>
            {items.map((s) => (
              <option key={s.id} value={s.id}>
                {scanLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <ArrowRight className="mx-auto hidden size-5 text-slate-400 md:block md:mb-2" aria-hidden />
        <div>
          <label htmlFor="compare-current" className="mb-1.5 block text-sm font-medium text-slate-700">Current</label>
          <select id="compare-current" value={current} disabled={!items.length} onChange={(e) => setCurrent(e.target.value)} className={SELECT}>
            <option value="">Select a scan</option>
            {items.map((s) => (
              <option key={s.id} value={s.id}>
                {scanLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={!base || !current || base === current}
          onClick={() => onPick(Number(base), Number(current))}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800 disabled:bg-teal-700/50"
        >
          <GitCompare className="size-4" aria-hidden />
          Compare
        </button>
      </div>
      {projectId && scans.data && items.length < 2 && (
        <p className="mt-3 text-sm text-slate-500">This project needs at least two successfully processed scans to compare.</p>
      )}
    </Card>
  );
}

function Result({ result }: { result: ComparisonResult }) {
  const [tab, setTab] = useState<Classification | 'All'>('All');
  const counts: Record<Classification, number> = {
    New: result.counts.new,
    Reopened: result.counts.reopened,
    Resolved: result.counts.resolved,
    Persistent: result.counts.persistent,
  };
  const items = useMemo(() => (tab === 'All' ? result.items : result.items.filter((i) => i.classification === tab)), [tab, result.items]);
  const attention = result.items.filter((i) => i.attention).length;

  const scanCard = (label: string, scan: Scan) => (
    <div className="min-w-0 flex-1 rounded-md border border-slate-200 px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <Link to={scanPath(scan.id)} className="block truncate font-medium text-slate-900 hover:text-teal-700">
        {scan.scan_name}
      </Link>
      <p className="text-xs text-slate-500">
        {[scan.scanner, scan.report_type].filter(Boolean).join(' ')} · {formatDateTime(scan.scan_date ?? scan.uploaded_at)} · {scan.total_findings} findings
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        {scanCard('Baseline', result.base)}
        <ArrowRight className="mx-auto size-5 shrink-0 rotate-90 text-slate-400 sm:rotate-0" aria-hidden />
        {scanCard('Current', result.compare)}
      </div>

      {result.warnings.map((warning) => (
        <p key={warning} role="note" className="flex items-start gap-2 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {warning}
        </p>
      ))}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CLASSIFICATIONS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setTab(kind)}
            aria-pressed={tab === kind}
            className={`rounded-lg border bg-white px-4 py-3 text-left shadow-xs ${tab === kind ? 'border-teal-600 ring-1 ring-teal-600' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CLASSIFICATION_STYLES[kind].badge}`}>{kind}</span>
            <span className="mt-2 block text-2xl font-semibold tabular-nums text-slate-900" data-testid={`count-${kind}`}>
              {counts[kind]}
            </span>
            <span className="block text-xs text-slate-500">{CLASSIFICATION_STYLES[kind].help}</span>
          </button>
        ))}
      </div>

      <Card
        bodyClassName=""
        title={tab === 'All' ? `All findings (${result.items.length})` : `${tab} (${items.length})`}
        description={attention ? `${attention} finding(s) have a status that disagrees with these scans — see the notes. Statuses are not changed automatically.` : 'Classification uses finding fingerprints, not titles.'}
        actions={
          tab !== 'All' && (
            <button type="button" onClick={() => setTab('All')} className="text-sm font-medium text-teal-700 hover:text-teal-800">
              Show all
            </button>
          )
        }
      >
        {items.length === 0 ? (
          <EmptyState compact title={`No ${tab === 'All' ? '' : tab.toLowerCase() + ' '}findings`} />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2">Result</th>
                  <th scope="col" className="px-4 py-2">Finding</th>
                  <th scope="col" className="px-4 py-2">Location</th>
                  <th scope="col" className="min-w-72 px-4 py-2">Why</th>
                  <th scope="col" className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={`${item.classification}-${item.finding.id}`} className="align-top">
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${CLASSIFICATION_STYLES[item.classification].badge}`}>
                        {item.classification}
                      </span>
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <div className="mb-1">
                        <SeverityBadge severity={item.finding.normalized_severity} original={item.finding.original_severity} />
                      </div>
                      <Link to={findingPath(item.finding.id)} className="font-medium text-slate-900 hover:text-teal-700">
                        {item.finding.normalized_title}
                      </Link>
                      <p className="text-xs text-slate-500">{[item.finding.source_tool, item.finding.source_template, item.finding.cwe].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td className="max-w-xs px-4 py-3 font-mono text-xs break-all text-slate-700">
                      {item.finding.http_method && <span className="mr-1 font-semibold">{item.finding.http_method}</span>}
                      {item.finding.endpoint ?? '—'}
                      {item.finding.parameter && <span className="block text-slate-500">param: {item.finding.parameter}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      <p>{item.reason}</p>
                      {item.renamed_from && (
                        <p className="mt-1 text-slate-500">
                          Previous title:{' '}
                          <Link to={findingPath(item.renamed_from.id)} className="text-teal-700 hover:text-teal-800">
                            {item.renamed_from.title}
                          </Link>
                        </p>
                      )}
                      {item.attention && (
                        <p className="mt-1 flex items-start gap-1 font-medium text-amber-800">
                          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          {item.attention}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <FindingStatusBadge status={item.finding.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function ComparePage() {
  useDocumentTitle('Compare scans');
  const [params, setParams] = useSearchParams();
  const base = Number(params.get('base')) || null;
  const current = Number(params.get('compare')) || null;
  const comparison = useApiQuery(
    () => (base && current ? scanService.compare(base, current) : Promise.resolve(null)),
    [base, current],
  );

  return (
    <>
      <PageHeader
        title="Compare scans"
        description="New, resolved, persistent and reopened findings between two scans, matched by fingerprint."
        breadcrumb={
          <Link to={ROUTES.scans} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-4" aria-hidden />
            Scans
          </Link>
        }
        actions={
          comparison.data && (
            <Link to={projectPath(comparison.data.project_id)} className="text-sm font-medium text-teal-700 hover:text-teal-800">
              {comparison.data.project_name}
            </Link>
          )
        }
      />
      {!base || !current ? (
        <ScanPicker onPick={(b, c) => setParams({ base: String(b), compare: String(c) })} />
      ) : comparison.error ? (
        <Card>
          <ErrorState title="Scans could not be compared" message={comparison.error.message} />
          <div className="pb-6 text-center">
            <button type="button" onClick={() => setParams({})} className="text-sm font-medium text-teal-700 hover:text-teal-800">
              Choose other scans
            </button>
          </div>
        </Card>
      ) : !comparison.data ? (
        <Card>
          <LoadingState label="Comparing scans…" />
        </Card>
      ) : (
        <>
          <div className="mb-4 text-right">
            <button type="button" onClick={() => setParams({ project: String(comparison.data!.project_id) })} className="text-sm font-medium text-teal-700 hover:text-teal-800">
              Choose other scans
            </button>
          </div>
          <Result result={comparison.data} />
        </>
      )}
    </>
  );
}
