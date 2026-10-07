import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleCheck, ListChecks, ShieldCheck, Upload, X } from 'lucide-react';
import Card from '../ui/Card';
import Button, { buttonClasses } from '../ui/Button';
import Pagination from '../ui/Pagination';
import EmptyState from '../states/EmptyState';
import LoadingState from '../states/LoadingState';
import ErrorState from '../states/ErrorState';
import FindingFilters from './FindingFilters';
import FindingsTable from './FindingsTable';
import BulkUpdateDialog from './BulkUpdateDialog';
import { findingService } from '../../services/findingService';
import { projectService } from '../../services/projectService';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useActingUser } from '../../hooks/useActingUser';
import { useFindingQuery } from '../../hooks/useFindingQuery';
import { FINDING_PAGE_SIZES, MAX_BULK_FINDINGS } from '../../utils/constants';
import { ROUTES } from '../../utils/routes';
import type { BulkUpdateResult } from '../../types/finding';

interface FindingsWorkspaceProps {
  /** Restricts the view to these severities (e.g. the Critical & High page). */
  lockedSeverities?: readonly string[];
  /** Restricts the view to findings observed in one scan. */
  scanId?: number;
  emptyTitle?: string;
}

export default function FindingsWorkspace({ lockedSeverities, scanId, emptyTitle = 'No findings available' }: FindingsWorkspaceProps) {
  const findingQuery = useFindingQuery(lockedSeverities, scanId);
  const { query, filters, sortBy, sortOrder, setSort, setPage, setPageSize, pageSize, activeFilterCount } = findingQuery;
  const { users, activeUsers, actingUser } = useActingUser();

  const list = useApiQuery(() => findingService.list(query), [JSON.stringify(query)]);
  const projects = useApiQuery(() => projectService.list({ page_size: 100, sort_by: 'name', sort_order: 'asc' }), []);
  const facets = useApiQuery(() => findingService.facets(), []);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [lastResult, setLastResult] = useState<BulkUpdateResult | null>(null);

  // A new filter set means a new result set: start the selection again.
  const filterKey = JSON.stringify({ ...query, page: undefined, page_size: undefined, sort_by: undefined, sort_order: undefined });
  useEffect(() => setSelected(new Set()), [filterKey]);

  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePage = (ids: number[], select: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      ids.forEach((id) => (select ? next.add(id) : next.delete(id)));
      return next;
    });

  const selectedIds = useMemo(() => [...selected], [selected]);
  const tooMany = selectedIds.length > MAX_BULK_FINDINGS;

  const data = list.data;
  const noDataAtAll = data && data.total === 0 && activeFilterCount === 0;

  return (
    <>
      {lastResult && (
        <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="flex items-center gap-2">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            Updated {lastResult.updated} finding{lastResult.updated === 1 ? '' : 's'}
            {lastResult.unchanged > 0 && ` · ${lastResult.unchanged} already had these values and were left unchanged`}.
          </p>
          <button type="button" onClick={() => setLastResult(null)} aria-label="Dismiss" className="text-emerald-700 hover:text-emerald-900">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}

      <Card bodyClassName="">
        <FindingFilters
          {...findingQuery}
          projects={projects.data?.items ?? []}
          users={users}
          facets={facets.data}
          severityOptions={lockedSeverities}
        />

        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-teal-100 bg-teal-50 px-4 py-2.5 text-sm" role="region" aria-label="Bulk actions">
            <span className="font-medium text-teal-900">
              {selectedIds.length} selected
            </span>
            <Button size="sm" icon={<ListChecks className="size-4" aria-hidden />} disabled={tooMany} onClick={() => setBulkOpen(true)}>
              Change status / assign
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
            {tooMany && <span className="text-red-700">Select at most {MAX_BULK_FINDINGS} findings per update.</span>}
          </div>
        )}

        {list.error ? (
          <ErrorState title="Findings could not be loaded" message={list.error.message} onRetry={list.reload} />
        ) : !data ? (
          <LoadingState label="Loading findings…" />
        ) : noDataAtAll ? (
          <EmptyState
            icon={<ShieldCheck className="size-5" aria-hidden />}
            title={emptyTitle}
            description="Findings are created only from uploaded VAPT reports."
            action={
              <Link to={ROUTES.upload} className={buttonClasses('primary')}>
                <Upload className="size-4" aria-hidden />
                Upload VAPT Report
              </Link>
            }
          />
        ) : data.total === 0 ? (
          <EmptyState title="No matching findings" description="No findings match the current search and filters." />
        ) : (
          <>
            <FindingsTable
              items={data.items}
              selected={selected}
              onToggle={toggle}
              onTogglePage={togglePage}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={setSort}
              showProject={filters.projects.length !== 1}
              busy={list.loading}
            />
            <div className="flex flex-col items-stretch sm:flex-row sm:items-center">
              <div className="flex-1">
                <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={setPage} />
              </div>
              <label className="flex items-center gap-2 border-t border-slate-200 px-5 py-3 text-sm text-slate-600 sm:border-l">
                Per page
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="rounded-md border-0 py-1 pr-7 pl-2 text-sm ring-1 ring-inset ring-slate-300"
                >
                  {FINDING_PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}
      </Card>

      <BulkUpdateDialog
        open={bulkOpen}
        findingIds={selectedIds}
        users={activeUsers}
        actingUser={actingUser}
        onClose={() => setBulkOpen(false)}
        onDone={(result) => {
          setBulkOpen(false);
          setLastResult(result);
          setSelected(new Set());
          list.reload();
        }}
      />
    </>
  );
}
