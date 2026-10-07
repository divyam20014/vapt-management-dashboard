import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, GitCompare, ScanLine } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import MultiSelect from '../components/ui/MultiSelect';
import Pagination from '../components/ui/Pagination';
import EmptyState from '../components/states/EmptyState';
import LoadingState from '../components/states/LoadingState';
import ErrorState from '../components/states/ErrorState';
import ScanStatusBadge from '../components/scans/ScanStatusBadge';
import SeverityBreakdown from '../components/scans/SeverityBreakdown';
import { uploadAction } from '../components/dashboard/DashboardSections';
import { scanService } from '../services/scanService';
import { projectService } from '../services/projectService';
import { useApiQuery } from '../hooks/useApiQuery';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { SCANNERS, SCAN_STATUSES } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import { comparePath, projectPath, scanPath } from '../utils/routes';
import type { Scan, ScanQuery } from '../types/scan';

const PAGE_SIZE = 25;

export default function ScansPage() {
  useDocumentTitle('Scans');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const projects = params.getAll('project');
  const scanners = params.getAll('scanner');
  const statuses = params.getAll('status');
  const sortBy = (params.get('sort') === 'uploaded_at' ? 'uploaded_at' : 'scan_time') as ScanQuery['sort_by'];
  const sortOrder = params.get('order') === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const query: ScanQuery = {
    page,
    page_size: PAGE_SIZE,
    project_id: projects.map(Number),
    scanner: scanners,
    status: statuses,
    sort_by: sortBy,
    sort_order: sortOrder,
  };
  const list = useApiQuery(() => scanService.list(query), [JSON.stringify(query)]);
  const projectList = useApiQuery(() => projectService.list({ page_size: 100, sort_by: 'name', sort_order: 'asc' }), []);
  const [selected, setSelected] = useState<Scan[]>([]);

  useEffect(() => setSelected([]), [params.toString()]);

  const setList = (key: string, values: string[]) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete(key);
      values.forEach((value) => next.append(key, value));
      next.delete('page');
      return next;
    });
  const setParam = (key: string, value: string | null, resetPage = true) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value === null) next.delete(key);
      else next.set(key, value);
      if (resetPage) next.delete('page');
      return next;
    });

  const toggle = (scan: Scan) =>
    setSelected((current) =>
      current.some((s) => s.id === scan.id) ? current.filter((s) => s.id !== scan.id) : [...current, scan].slice(-2),
    );

  const compareProblem =
    selected.length !== 2
      ? 'Select two scans of the same project to compare.'
      : selected[0].project_id !== selected[1].project_id
        ? 'The selected scans belong to different projects.'
        : selected.some((s) => s.processing_status !== 'Completed')
          ? 'Failed scans have no findings to compare.'
          : null;

  const sortHeader = (field: 'scan_time' | 'uploaded_at', label: string) => {
    const active = sortBy === field;
    const Icon = sortOrder === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th scope="col" aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-3 py-3 text-left">
        <button
          type="button"
          className="inline-flex items-center gap-1 uppercase hover:text-slate-900"
          onClick={() =>
            setParams((current) => {
              const next = new URLSearchParams(current);
              next.set('sort', field);
              next.set('order', active && sortOrder === 'desc' ? 'asc' : 'desc');
              next.delete('page');
              return next;
            })
          }
        >
          {label}
          {active && <Icon className="size-3.5" aria-hidden />}
        </button>
      </th>
    );
  };

  const data = list.data;
  const hasFilters = projects.length + scanners.length + statuses.length > 0;

  return (
    <>
      <PageHeader title="Scans" description="Every uploaded report, newest scan date first. Select two scans of a project to compare them." />
      <Card bodyClassName="">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
          <MultiSelect
            label="Project"
            options={(projectList.data?.items ?? []).map((p) => ({ value: String(p.id), label: p.name }))}
            selected={projects}
            onChange={(values) => setList('project', values)}
            emptyText="No projects"
          />
          <MultiSelect label="Scanner" options={SCANNERS.map((s) => ({ value: s, label: s }))} selected={scanners} onChange={(values) => setList('scanner', values)} />
          <MultiSelect label="Processing" options={SCAN_STATUSES.map((s) => ({ value: s, label: s }))} selected={statuses} onChange={(values) => setList('status', values)} />
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-teal-100 bg-teal-50 px-4 py-2.5 text-sm" role="region" aria-label="Compare scans">
            <span className="font-medium text-teal-900">{selected.length} of 2 selected</span>
            <Button
              size="sm"
              icon={<GitCompare className="size-4" aria-hidden />}
              disabled={compareProblem !== null}
              onClick={() => {
                // Older scan (by scan date, else upload time) is the baseline, whatever the selection order.
                const [base, current] = [...selected].sort((a, b) =>
                  (a.scan_date ?? a.uploaded_at).localeCompare(b.scan_date ?? b.uploaded_at) || a.id - b.id,
                );
                navigate(comparePath(base.id, current.id));
              }}
            >
              Compare
            </Button>
            {compareProblem && <span className="text-slate-600">{compareProblem}</span>}
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        )}

        {list.error ? (
          <ErrorState title="Scans could not be loaded" message={list.error.message} onRetry={list.reload} />
        ) : !data ? (
          <LoadingState label="Loading scans…" />
        ) : data.total === 0 ? (
          hasFilters ? (
            <EmptyState title="No matching scans" description="No scans match the selected filters." />
          ) : (
            <EmptyState icon={<ScanLine className="size-5" aria-hidden />} title="No scans available" description="Each uploaded report creates a scan record." action={uploadAction()} />
          )
        ) : (
          <>
            <div className={`relative overflow-x-auto ${list.loading ? 'opacity-60' : ''}`}>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs font-medium tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="w-10 px-3 py-3">
                      <span className="sr-only">Select for comparison</span>
                    </th>
                    <th scope="col" className="px-3 py-3 text-left uppercase">Scan</th>
                    <th scope="col" className="px-3 py-3 text-left uppercase">Project</th>
                    {sortHeader('scan_time', 'Scan date')}
                    {sortHeader('uploaded_at', 'Uploaded')}
                    <th scope="col" className="px-3 py-3 text-left uppercase">Processing</th>
                    <th scope="col" className="px-3 py-3 text-left uppercase">Findings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((scan) => (
                    <tr key={scan.id} className={selected.some((s) => s.id === scan.id) ? 'bg-teal-50/50' : 'hover:bg-slate-50'}>
                      <td className="px-3 py-3 align-top">
                        <input
                          type="checkbox"
                          aria-label={`Select ${scan.scan_name} for comparison`}
                          className="size-4 rounded border-slate-300 text-teal-700"
                          checked={selected.some((s) => s.id === scan.id)}
                          onChange={() => toggle(scan)}
                        />
                      </td>
                      <td className="max-w-xs px-3 py-3 align-top">
                        <Link to={scanPath(scan.id)} className="font-medium text-slate-900 hover:text-teal-700">
                          {scan.scan_name}
                        </Link>
                        <p className="text-xs text-slate-500">{[scan.scanner, scan.report_type].filter(Boolean).join(' ') || 'Report type not identified'}</p>
                      </td>
                      <td className="px-3 py-3 align-top whitespace-nowrap">
                        <Link to={projectPath(scan.project_id)} className="text-teal-700 hover:text-teal-800">
                          {scan.project_name}
                        </Link>
                      </td>
                      <td className="px-3 py-3 align-top whitespace-nowrap text-slate-700">
                        {scan.scan_date ? formatDateTime(scan.scan_date) : <span className="text-slate-400" title="The report contains no scan date">Not in report</span>}
                      </td>
                      <td className="px-3 py-3 align-top whitespace-nowrap text-slate-600">{formatDateTime(scan.uploaded_at)}</td>
                      <td className="px-3 py-3 align-top">
                        <ScanStatusBadge status={scan.processing_status} />
                      </td>
                      <td className="px-3 py-3 align-top">
                        {scan.processing_status === 'Failed' ? (
                          <span className="text-xs text-red-700">{scan.processing_error}</span>
                        ) : (
                          <>
                            <span className="text-sm font-medium tabular-nums text-slate-900">{scan.total_findings}</span>
                            <SeverityBreakdown
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={(p) => setParam('page', String(p), false)} />
          </>
        )}
      </Card>
    </>
  );
}
