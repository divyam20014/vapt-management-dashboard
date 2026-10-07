import { api } from './api';
import type { Page } from '../types/api';
import type { Scan, ScanDetail, ScanQuery, UploadInput, UploadResult } from '../types/scan';
import type { ComparisonResult } from '../types/comparison';
import { serializeQuery } from './findingService';

/** Report processing happens during the request, so allow far longer than the default timeout. */
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

export const scanService = {
  async upload(input: UploadInput, onUploadProgress?: (fraction: number) => void): Promise<UploadResult> {
    const form = new FormData();
    form.append('project_id', String(input.projectId));
    form.append('file', input.file);
    if (input.scanName?.trim()) form.append('scan_name', input.scanName.trim());
    if (input.scanDate) form.append('scan_date', input.scanDate);
    if (input.allowDuplicate) form.append('allow_duplicate', 'true');

    const { data } = await api.post<UploadResult>('/scans/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: UPLOAD_TIMEOUT_MS,
      onUploadProgress: (event) => {
        if (onUploadProgress && event.total) onUploadProgress(event.loaded / event.total);
      },
    });
    return data;
  },

  async list(query: ScanQuery): Promise<Page<Scan>> {
    const { data } = await api.get<Page<Scan>>(`/scans?${serializeQuery(query)}`);
    return data;
  },

  /** Admin only. Also removes findings no other scan observed, and the original file. */
  async remove(id: number): Promise<{ findings_removed: number; findings_kept: number }> {
    const { data } = await api.delete<{ findings_removed: number; findings_kept: number }>(`/scans/${id}`);
    return data;
  },

  async get(id: number): Promise<ScanDetail> {
    const { data } = await api.get<ScanDetail>(`/scans/${id}`);
    return data;
  },

  async compare(baseScanId: number, compareScanId: number): Promise<ComparisonResult> {
    const { data } = await api.get<ComparisonResult>('/scans/compare', {
      params: { base_scan_id: baseScanId, compare_scan_id: compareScanId },
    });
    return data;
  },

  /** Download link for the original uploaded report (served as an attachment). */
  originalUrl(id: number): string {
    return `${api.defaults.baseURL}/scans/${id}/original`;
  },

  async listForProject(projectId: number, page = 1, pageSize = 10): Promise<Page<Scan>> {
    const { data } = await api.get<Page<Scan>>(`/projects/${projectId}/scans`, { params: { page, page_size: pageSize } });
    return data;
  },
};
