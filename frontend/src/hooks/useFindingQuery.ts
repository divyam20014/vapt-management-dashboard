import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DEFAULT_FINDING_PAGE_SIZE, FINDING_PAGE_SIZES } from '../utils/constants';
import type { FindingQuery, FindingSortField } from '../types/finding';

const SORT_FIELDS: FindingSortField[] = ['severity', 'title', 'status', 'source', 'endpoint', 'project', 'first_detected', 'last_detected', 'updated_at'];

/** URL keys, so filters survive refresh and can be shared as links. */
const KEYS = {
  search: 'q',
  project: 'project',
  severity: 'severity',
  status: 'status',
  source: 'source',
  category: 'category',
  assignee: 'assignee',
  dateField: 'date_field',
  from: 'from',
  to: 'to',
  sort: 'sort',
  order: 'order',
  page: 'page',
  size: 'size',
} as const;

export interface FindingFilterState {
  search: string;
  projects: string[];
  severities: string[];
  statuses: string[];
  sources: string[];
  categories: string[];
  assignee: string;
  dateField: 'first_detected' | 'last_detected';
  from: string;
  to: string;
}

type FilterKey = keyof FindingFilterState;
const LIST_FILTERS: Partial<Record<FilterKey, string>> = {
  projects: KEYS.project,
  severities: KEYS.severity,
  statuses: KEYS.status,
  sources: KEYS.source,
  categories: KEYS.category,
};
const SCALAR_FILTERS: Partial<Record<FilterKey, string>> = {
  search: KEYS.search,
  assignee: KEYS.assignee,
  dateField: KEYS.dateField,
  from: KEYS.from,
  to: KEYS.to,
};

export function useFindingQuery(lockedSeverities?: readonly string[], scanId?: number) {
  const [params, setParams] = useSearchParams();

  const filters: FindingFilterState = useMemo(() => {
    const requested = params.getAll(KEYS.severity);
    return {
      search: params.get(KEYS.search) ?? '',
      projects: params.getAll(KEYS.project),
      severities: lockedSeverities ? requested.filter((s) => lockedSeverities.includes(s)) : requested,
      statuses: params.getAll(KEYS.status),
      sources: params.getAll(KEYS.source),
      categories: params.getAll(KEYS.category),
      assignee: params.get(KEYS.assignee) ?? '',
      dateField: params.get(KEYS.dateField) === 'first_detected' ? 'first_detected' : 'last_detected',
      from: params.get(KEYS.from) ?? '',
      to: params.get(KEYS.to) ?? '',
    };
  }, [params, lockedSeverities]);

  const sortParam = params.get(KEYS.sort) as FindingSortField | null;
  const sortBy: FindingSortField = sortParam && SORT_FIELDS.includes(sortParam) ? sortParam : 'severity';
  const sortOrder: 'asc' | 'desc' = params.get(KEYS.order) === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(params.get(KEYS.page)) || 1);
  const sizeParam = Number(params.get(KEYS.size));
  const pageSize = (FINDING_PAGE_SIZES as readonly number[]).includes(sizeParam) ? sizeParam : DEFAULT_FINDING_PAGE_SIZE;

  const query: FindingQuery = useMemo(
    () => ({
      page,
      page_size: pageSize,
      search: filters.search.trim() || undefined,
      project_id: filters.projects.map(Number).filter(Boolean),
      scan_id: scanId,
      severity: filters.severities.length ? filters.severities : lockedSeverities ? [...lockedSeverities] : undefined,
      status: filters.statuses,
      source_tool: filters.sources,
      category: filters.categories,
      assignee: filters.assignee || undefined,
      date_field: filters.from || filters.to ? filters.dateField : undefined,
      date_from: filters.from || undefined,
      date_to: filters.to || undefined,
      sort_by: sortBy,
      sort_order: sortOrder,
    }),
    [filters, page, pageSize, sortBy, sortOrder, lockedSeverities, scanId],
  );

  const update = useCallback(
    (mutate: (next: URLSearchParams) => void, resetPage = true) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          mutate(next);
          if (resetPage) next.delete(KEYS.page);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setFilter = useCallback(
    <K extends FilterKey>(key: K, value: FindingFilterState[K]) =>
      update((next) => {
        const listKey = LIST_FILTERS[key];
        const scalarKey = SCALAR_FILTERS[key];
        if (listKey) {
          next.delete(listKey);
          (value as string[]).forEach((item) => next.append(listKey, item));
        } else if (scalarKey) {
          if (value) next.set(scalarKey, value as string);
          else next.delete(scalarKey);
        }
      }),
    [update],
  );

  const clearFilters = useCallback(
    () =>
      update((next) => {
        [...Object.values(LIST_FILTERS), ...Object.values(SCALAR_FILTERS)].forEach((key) => next.delete(key!));
      }),
    [update],
  );

  const setSort = useCallback(
    (field: FindingSortField) =>
      update((next) => {
        const order = field === sortBy ? (sortOrder === 'asc' ? 'desc' : 'asc') : field === 'title' || field === 'endpoint' ? 'asc' : 'desc';
        next.set(KEYS.sort, field);
        next.set(KEYS.order, order);
      }),
    [update, sortBy, sortOrder],
  );

  const setPage = useCallback((value: number) => update((next) => next.set(KEYS.page, String(value)), false), [update]);
  const setPageSize = useCallback((value: number) => update((next) => next.set(KEYS.size, String(value))), [update]);

  const activeFilterCount =
    Number(Boolean(filters.search.trim())) +
    filters.projects.length +
    filters.severities.length +
    filters.statuses.length +
    filters.sources.length +
    filters.categories.length +
    Number(Boolean(filters.assignee)) +
    Number(Boolean(filters.from || filters.to));

  return { filters, query, sortBy, sortOrder, page, pageSize, setFilter, clearFilters, setSort, setPage, setPageSize, activeFilterCount };
}
