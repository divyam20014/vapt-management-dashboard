import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Search } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import EmptyState from '../components/states/EmptyState';
import LoadingState from '../components/states/LoadingState';
import ErrorState from '../components/states/ErrorState';
import { remediationService } from '../services/remediationService';
import { useApiQuery } from '../hooks/useApiQuery';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { guidelineFindingsPath, guidelinePath } from '../utils/routes';
import { formatNumber } from '../utils/format';

const CONTROL =
  'block w-full rounded-md border-0 bg-white py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-teal-600 focus:outline-none';

export default function RemediationLibraryPage() {
  useDocumentTitle('Remediation Library');
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const category = params.get('category') ?? '';
  const debounced = useDebouncedValue(search.trim(), 300);

  const library = useApiQuery(
    () => remediationService.list({ search: debounced || undefined, category: category || undefined }),
    [debounced, category],
  );
  const categories = useApiQuery(() => remediationService.list(), []);

  const setCategory = (value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set('category', value);
      else next.delete('category');
      return next;
    }, { replace: true });

  const filtered = Boolean(debounced || category);

  return (
    <>
      <PageHeader
        title="Remediation Library"
        description="Standard remediation guidance. It is application content, kept separate from the recommendations in uploaded reports, and is linked to findings only by an exact scanner rule or CWE."
      />
      <Card bodyClassName="">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              aria-label="Search guidance"
              placeholder="Search by title, CWE, ZAP alert ID, Nuclei template or keyword"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={`${CONTROL} pr-3 pl-9`}
            />
          </div>
          <select aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value)} className={`${CONTROL} px-3 sm:w-56`}>
            <option value="">All categories</option>
            {(categories.data?.categories ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {library.error ? (
          <ErrorState title="The library could not be loaded" message={library.error.message} onRetry={library.reload} />
        ) : !library.data ? (
          <LoadingState label="Loading remediation library…" />
        ) : library.data.items.length === 0 ? (
          <EmptyState
            compact
            icon={<BookOpen className="size-5" aria-hidden />}
            title={filtered ? 'No matching guidance' : 'No guidance available'}
            description={filtered ? 'Try a different search term or category.' : 'The remediation library is empty.'}
          />
        ) : (
          <ul className={`divide-y divide-slate-100 ${library.loading ? 'opacity-60' : ''}`} aria-label="Remediation guidelines">
            {library.data.items.map((g, index) => [
              (index === 0 || library.data!.items[index - 1].category !== g.category) && (
                <li key={`category-${g.category}`} className="bg-slate-50 px-4 py-2 sm:px-5">
                  <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{g.category}</h2>
                </li>
              ),
              <li key={g.slug} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <Link to={guidelinePath(g.slug)} className="font-medium text-slate-900 hover:text-teal-700">
                    {g.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[g.owasp, g.cwe_ids.join(', ')].filter(Boolean).join(' · ')}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{g.summary}</p>
                </div>
                <div className="shrink-0 text-sm sm:text-right">
                  {g.findings > 0 ? (
                    <Link to={guidelineFindingsPath(g.slug)} className="font-medium text-teal-700 hover:text-teal-800">
                      {formatNumber(g.active_findings)} active · {formatNumber(g.findings)} total
                    </Link>
                  ) : (
                    <span className="text-slate-400">No linked findings</span>
                  )}
                </div>
              </li>,
            ])}
          </ul>
        )}
      </Card>
    </>
  );
}
