import { api } from './api';
import type { Page } from '../types/api';
import type { Scan, UploadInput, UploadResult } from '../types/scan';

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

  async listForProject(projectId: number, page = 1, pageSize = 10): Promise<Page<Scan>> {
    const { data } = await api.get<Page<Scan>>(`/projects/${projectId}/scans`, { params: { page, page_size: pageSize } });
    return data;
  },
};
