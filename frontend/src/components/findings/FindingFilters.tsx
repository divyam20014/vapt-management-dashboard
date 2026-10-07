import { Search, X } from 'lucide-react';
import MultiSelect from '../ui/MultiSelect';
import { useEffect, useState } from 'react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { FINDING_STATUSES, SEVERITY_FILTER_OPTIONS } from '../../utils/constants';
import type { FindingFilterState } from '../../hooks/useFindingQuery';
import type { FindingFacets } from '../../types/finding';
import type { Project } from '../../types/project';
import type { User } from '../../types/user';

const CONTROL_BASE =
  'rounded-md border-0 bg-white py-2 px-3 text-sm text-slate-700 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-teal-600 focus:outline-none';
const CONTROL = `block w-full ${CONTROL_BASE}`;

interface FindingFiltersProps {
  filters: FindingFilterState;
  setFilter: <K extends keyof FindingFilterState>(key: K, value: FindingFilterState[K]) => void;
  clearFilters: () => void;
  activeFilterCount: number;
  projects: Project[];
  users: User[];
  facets: FindingFacets | null;
  severityOptions?: readonly string[];
}

const toOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }));

export default function FindingFilters({
  filters,
  setFilter,
  clearFilters,
  activeFilterCount,
  projects,
  users,
  facets,
  severityOptions = SEVERITY_FILTER_OPTIONS,
}: FindingFiltersProps) {
  const [search, setSearch] = useState(filters.search);
  const debounced = useDebouncedValue(search, 350);

  useEffect(() => {
    if (debounced !== filters.search) setFilter('search', debounced);
    // Push typed text to the URL; the effect below syncs external changes (clear, back/forward).
  }, [debounced]);

  useEffect(() => {
    if (filters.search !== search && filters.search !== debounced) setSearch(filters.search);
  }, [filters.search]);

  return (
    <div className="space-y-3 border-b border-slate-100 p-4">
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, URL, endpoint, parameter, CWE, template or description"
            aria-label="Search findings"
            className={`${CONTROL} pl-9`}
          />
        </div>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              clearFilters();
            }}
            className="inline-flex items-center gap-1 self-start rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 lg:self-auto"
          >
            <X className="size-4" aria-hidden />
            Clear filters ({activeFilterCount})
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <MultiSelect
          label="Severity"
          options={toOptions(severityOptions)}
          selected={filters.severities}
          onChange={(value) => setFilter('severities', value)}
        />
        <MultiSelect label="Status" options={toOptions(FINDING_STATUSES)} selected={filters.statuses} onChange={(value) => setFilter('statuses', value)} />
        <MultiSelect
          label="Project"
          options={projects.map((project) => ({ value: String(project.id), label: project.name }))}
          selected={filters.projects}
          onChange={(value) => setFilter('projects', value)}
          emptyText="No projects"
        />
        <MultiSelect
          label="Source"
          options={toOptions(facets?.source_tools ?? [])}
          selected={filters.sources}
          onChange={(value) => setFilter('sources', value)}
          emptyText="No findings yet"
        />
        <MultiSelect
          label="Category"
          options={toOptions(facets?.categories ?? [])}
          selected={filters.categories}
          onChange={(value) => setFilter('categories', value)}
          emptyText="No categories in uploaded reports"
        />
        <select aria-label="Filter by assignee" value={filters.assignee} onChange={(event) => setFilter('assignee', event.target.value)} className={CONTROL}>
          <option value="">Assignee: All</option>
          <option value="unassigned">Unassigned</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
              {user.active ? '' : ' (inactive)'}
            </option>
          ))}
        </select>
        <select
          aria-label="Date filter applies to"
          value={filters.dateField}
          onChange={(event) => setFilter('dateField', event.target.value as FindingFilterState['dateField'])}
          className={CONTROL}
        >
          <option value="last_detected">Last detected</option>
          <option value="first_detected">First detected</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <span>Detected between</span>
        <input type="date" aria-label="From date" value={filters.from} max={filters.to || undefined} onChange={(event) => setFilter('from', event.target.value)} className={CONTROL_BASE} />
        <span>and</span>
        <input type="date" aria-label="To date" value={filters.to} min={filters.from || undefined} onChange={(event) => setFilter('to', event.target.value)} className={CONTROL_BASE} />
      </div>
    </div>
  );
}
