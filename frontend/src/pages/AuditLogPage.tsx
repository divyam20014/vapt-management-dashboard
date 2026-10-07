import { listProjectOptions } from '../services/projectOptions';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { History } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Pagination from '../components/ui/Pagination';
import EmptyState from '../components/states/EmptyState';
import LoadingState from '../components/states/LoadingState';
import ErrorState from '../components/states/ErrorState';
import { auditService } from '../services/auditService';
import { useApiQuery } from '../hooks/useApiQuery';
import { useUsers } from '../hooks/useUsers';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatDateTime } from '../utils/format';
import { findingPath, projectPath } from '../utils/routes';
import type { AuditEntry, AuditQuery } from '../types/audit';

const PAGE_SIZE = 50;
const CONTROL =
  'block w-full rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-teal-600 focus:outline-none';

/** A short, readable summary of an entry's stored details (scalars only; lists are counted). */
function summarize(details: AuditEntry['details']): string {
  if (!details) return '';
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => {
      const label = key.replace(/_/g, ' ');
      if (Array.isArray(value)) return `${label}: ${value.length}`;
      if (typeof value === 'object') {
        const inner = value as Record<string, unknown>;
        if ('from' in inner || 'to' in inner) return `${label}: ${String(inner.from ?? '—')} → ${String(inner.to ?? '—')}`;
        return `${label}: …`;
      }
      return `${label}: ${String(value)}`;
    })
    .join(' · ');
}

export default function AuditLogPage() {
  useDocumentTitle('Audit Log');
  const { users } = useUsers();
  const [filters, setFilters] = useState<AuditQuery>({});
  const [page, setPage] = useState(1);
  const query: AuditQuery = { ...filters, page, page_size: PAGE_SIZE };

  const list = useApiQuery(() => auditService.list(query), [JSON.stringify(query)]);
  const actions = useApiQuery(() => auditService.actions(), []);
  const projects = useApiQuery(() => listProjectOptions(), []);

  const update = (change: Partial<AuditQuery>) => {
    setFilters((current) => {
      const next = { ...current, ...change };
      (Object.keys(next) as (keyof AuditQuery)[]).forEach((key) => {
        if (next[key] === undefined || next[key] === '') delete next[key];
      });
      return next;
    });
    setPage(1);
  };
  const filtered = Object.keys(filters).length > 0;

  return (
    <>
      <PageHeader title="Audit Log" description="Who did what, and when. Entries are recorded by the server and cannot be edited." />
      <Card bodyClassName="">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-medium text-slate-600">
            User
            <select aria-label="User" className={`mt-1 ${CONTROL}`} value={filters.user_id ?? ''} onChange={(e) => update({ user_id: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">All users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Action
            <select aria-label="Action" className={`mt-1 ${CONTROL}`} value={filters.action ?? ''} onChange={(e) => update({ action: e.target.value || undefined })}>
              <option value="">All actions</option>
              {(actions.data ?? []).map((a) => (
                <option key={a.code} value={a.code}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Project
            <select aria-label="Project" className={`mt-1 ${CONTROL}`} value={filters.project_id ?? ''} onChange={(e) => update({ project_id: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">All projects</option>
              {(projects.data?.items ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            From
            <input type="date" aria-label="From" className={`mt-1 ${CONTROL}`} value={filters.date_from ?? ''} onChange={(e) => update({ date_from: e.target.value || undefined })} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            To
            <input type="date" aria-label="To" className={`mt-1 ${CONTROL}`} value={filters.date_to ?? ''} onChange={(e) => update({ date_to: e.target.value || undefined })} />
          </label>
        </div>

        {list.error ? (
          <ErrorState title="The audit log could not be loaded" message={list.error.message} onRetry={list.reload} />
        ) : !list.data ? (
          <LoadingState label="Loading audit log…" />
        ) : list.data.total === 0 ? (
          <EmptyState
            compact
            icon={<History className="size-5" aria-hidden />}
            title={filtered ? 'No matching entries' : 'No audit entries yet'}
            description={filtered ? 'No entries match the current filters.' : 'Actions such as uploads, status changes and exports appear here.'}
          />
        ) : (
          <>
            {/* Phones: one stacked entry per action. Larger screens: the table below. */}
            <ul className={`divide-y divide-slate-100 md:hidden ${list.loading ? 'opacity-60' : ''}`} aria-label="Audit entries">
              {list.data.items.map((entry) => (
                <li key={entry.id} className="space-y-1 px-4 py-3 text-sm">
                  <p className="font-medium text-slate-900">{entry.action_label}</p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(entry.timestamp)} · {entry.user ? (entry.user.name ?? `User #${entry.user.id}`) : 'System'}
                  </p>
                  {entry.project && (
                    <p className="text-xs text-slate-600">
                      Project: {entry.project.name ?? `#${entry.project.id} (deleted)`}
                    </p>
                  )}
                  {entry.finding && (
                    <p className="text-xs text-slate-600">
                      Finding:{' '}
                      <Link to={findingPath(entry.finding.id)} className="text-teal-700 hover:text-teal-800">
                        {entry.finding.title ?? `#${entry.finding.id} (deleted)`}
                      </Link>
                    </p>
                  )}
                  {entry.details && <p className="text-xs break-words text-slate-500">{summarize(entry.details)}</p>}
                </li>
              ))}
            </ul>
            <div className={`relative hidden overflow-x-auto md:block ${list.loading ? 'opacity-60' : ''}`} aria-busy={list.loading}>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-2 whitespace-nowrap">Timestamp</th>
                    <th scope="col" className="px-4 py-2">User</th>
                    <th scope="col" className="px-4 py-2">Action</th>
                    <th scope="col" className="px-4 py-2">Project</th>
                    <th scope="col" className="px-4 py-2">Finding</th>
                    <th scope="col" className="px-4 py-2">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.data.items.map((entry) => (
                    <tr key={entry.id} className="align-top">
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600">{formatDateTime(entry.timestamp)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{entry.user ? (entry.user.name ?? `User #${entry.user.id}`) : <span className="text-slate-400">System</span>}</td>
                      <td className="px-4 py-2 whitespace-nowrap font-medium text-slate-900">{entry.action_label}</td>
                      <td className="px-4 py-2">
                        {entry.project ? (
                          entry.project.name ? (
                            <Link to={projectPath(entry.project.id)} className="text-teal-700 hover:text-teal-800">
                              {entry.project.name}
                            </Link>
                          ) : (
                            <span className="text-slate-500">#{entry.project.id} (deleted)</span>
                          )
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="max-w-64 px-4 py-2">
                        {entry.finding ? (
                          <Link to={findingPath(entry.finding.id)} className="text-teal-700 hover:text-teal-800">
                            {entry.finding.title ?? `#${entry.finding.id} (deleted)`}
                          </Link>
                        ) : Array.isArray(entry.details?.finding_ids) ? (
                          <span className="text-slate-600">{(entry.details.finding_ids as unknown[]).length} findings</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="max-w-md px-4 py-2 text-xs break-words text-slate-600">{summarize(entry.details)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={list.data.page} pageSize={list.data.page_size} total={list.data.total} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
