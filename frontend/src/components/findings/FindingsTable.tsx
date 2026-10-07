import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { FindingStatusBadge, SeverityBadge } from './Badges';
import { formatDate } from '../../utils/format';
import { findingPath } from '../../utils/routes';
import type { FindingListItem, FindingSortField } from '../../types/finding';

interface FindingsTableProps {
  items: FindingListItem[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onTogglePage: (ids: number[], select: boolean) => void;
  sortBy: FindingSortField;
  sortOrder: 'asc' | 'desc';
  onSort: (field: FindingSortField) => void;
  showProject: boolean;
  busy?: boolean;
  /** Selection checkboxes (bulk actions); off for roles that cannot change findings. */
  selectable?: boolean;
}

export default function FindingsTable({ items, selected, onToggle, onTogglePage, sortBy, sortOrder, onSort, showProject, busy, selectable = true }: FindingsTableProps) {
  const location = useLocation();
  const pageIds = items.map((item) => item.id);
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
  const headerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerRef.current) headerRef.current.indeterminate = selectedOnPage > 0 && selectedOnPage < pageIds.length;
  }, [selectedOnPage, pageIds.length]);

  const sortable = (field: FindingSortField, label: string, className = '') => {
    const active = sortBy === field;
    const Icon = sortOrder === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th scope="col" aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-3 py-3 text-left ${className}`}>
        <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 uppercase hover:text-slate-900">
          {label}
          {active && <Icon className="size-3.5" aria-hidden />}
        </button>
      </th>
    );
  };

  return (
    <div className={`relative overflow-x-auto ${busy ? 'opacity-60' : ''}`} aria-busy={busy}>
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-xs font-medium tracking-wide text-slate-500">
          <tr>
            {selectable && (
              <th scope="col" className="w-10 px-3 py-3">
                <input
                  ref={headerRef}
                  type="checkbox"
                  aria-label="Select all findings on this page"
                  className="size-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  checked={pageIds.length > 0 && selectedOnPage === pageIds.length}
                  onChange={(event) => onTogglePage(pageIds, event.target.checked)}
                />
              </th>
            )}
            {sortable('severity', 'Severity')}
            {sortable('title', 'Finding', 'min-w-64')}
            <th scope="col" className="px-3 py-3 text-left uppercase">Category</th>
            {sortable('endpoint', 'Endpoint', 'min-w-56')}
            {sortable('source', 'Source')}
            {sortable('status', 'Status')}
            <th scope="col" className="px-3 py-3 text-left uppercase">Assignee</th>
            {sortable('first_detected', 'First detected')}
            {sortable('last_detected', 'Last detected')}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id} className={selected.has(item.id) ? 'bg-teal-50/50' : 'hover:bg-slate-50'}>
              {selectable && (
                <td className="px-3 py-3 align-top">
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.normalized_title}`}
                    className="size-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                    checked={selected.has(item.id)}
                    onChange={() => onToggle(item.id)}
                  />
                </td>
              )}
              <td className="px-3 py-3 align-top">
                <SeverityBadge severity={item.normalized_severity} original={item.original_severity} />
              </td>
              <td className="max-w-md px-3 py-3 align-top">
                <Link
                  to={findingPath(item.id)}
                  state={{ from: `${location.pathname}${location.search}` }}
                  className="font-medium text-slate-900 hover:text-teal-700"
                >
                  {item.normalized_title}
                </Link>
                <p className="mt-0.5 text-xs text-slate-500">
                  {[showProject ? item.project_name : null, item.cwe, item.occurrence_count > 1 ? `${item.occurrence_count} observations` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {/* Small screens: the endpoint column is scrolled out of view, so show where the finding is here. */}
                <p className="mt-0.5 font-mono text-xs break-all text-slate-500 md:hidden" aria-hidden>
                  {item.endpoint}
                </p>
              </td>
              <td className="px-3 py-3 align-top text-slate-600">{item.category ?? '—'}</td>
              <td className="max-w-xs px-3 py-3 align-top">
                <p className="truncate font-mono text-xs text-slate-700" title={item.affected_url ?? undefined}>
                  {item.http_method && <span className="mr-1 font-semibold">{item.http_method}</span>}
                  {item.endpoint ?? '—'}
                </p>
                {item.parameter && <p className="truncate text-xs text-slate-500">param: {item.parameter}</p>}
              </td>
              <td className="px-3 py-3 align-top whitespace-nowrap text-slate-600">{item.source_tool}</td>
              <td className="px-3 py-3 align-top">
                <FindingStatusBadge status={item.status} />
              </td>
              <td className="px-3 py-3 align-top whitespace-nowrap text-slate-600">{item.assignee?.name ?? <span className="text-slate-400">Unassigned</span>}</td>
              <td className="px-3 py-3 align-top whitespace-nowrap text-slate-600">{formatDate(item.first_detected)}</td>
              <td className="px-3 py-3 align-top whitespace-nowrap text-slate-600">{formatDate(item.last_detected)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
