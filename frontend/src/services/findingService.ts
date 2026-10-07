import { api } from './api';
import type { Page } from '../types/api';
import type {
  BulkUpdateResult,
  FindingChange,
  FindingDetail,
  FindingFacets,
  FindingListItem,
  FindingQuery,
  OccurrenceRaw,
} from '../types/finding';

/** Repeated keys (severity=High&severity=Critical), as the API expects for multi-value filters. */
export function serializeQuery(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((item) => search.append(key, String(item)));
    else search.append(key, String(value));
  }
  return search.toString();
}

export const findingService = {
  async list(query: FindingQuery): Promise<Page<FindingListItem>> {
    const { data } = await api.get<Page<FindingListItem>>(`/findings?${serializeQuery(query)}`);
    return data;
  },

  async get(id: number): Promise<FindingDetail> {
    const { data } = await api.get<FindingDetail>(`/findings/${id}`);
    return data;
  },

  async update(id: number, change: FindingChange): Promise<FindingDetail> {
    const { data } = await api.put<FindingDetail>(`/findings/${id}`, change);
    return data;
  },

  async bulkUpdate(findingIds: number[], change: FindingChange): Promise<BulkUpdateResult> {
    const { data } = await api.post<BulkUpdateResult>('/findings/bulk-update', { finding_ids: findingIds, ...change });
    return data;
  },

  async decideDuplicate(findingId: number, pairId: number, decision: string, comment?: string): Promise<FindingDetail> {
    const { data } = await api.put<FindingDetail>(`/findings/${findingId}/duplicates/${pairId}`, { decision, comment });
    return data;
  },

  /** Admin only. */
  async remove(id: number): Promise<void> {
    await api.delete(`/findings/${id}`);
  },

  async facets(): Promise<FindingFacets> {
    const { data } = await api.get<FindingFacets>('/findings/facets');
    return data;
  },

  async rawOccurrence(findingId: number, occurrenceId: number): Promise<OccurrenceRaw> {
    const { data } = await api.get<OccurrenceRaw>(`/findings/${findingId}/occurrences/${occurrenceId}/raw`);
    return data;
  },
};
