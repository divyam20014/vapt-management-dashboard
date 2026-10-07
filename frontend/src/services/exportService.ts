import { api } from './api';
import { serializeQuery } from './findingService';
import type { FindingQuery } from '../types/finding';

export type ExportFormat = 'csv' | 'xlsx' | 'json';

export interface SavedExport {
  name: string;
  kind: 'findings' | 'project_report' | 'other';
  format: string;
  size: number;
  created_at: string;
}

function filenameFrom(disposition: string | undefined, fallback: string): string {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? '');
  return match ? decodeURIComponent(match[1]) : fallback;
}

/**
 * Downloads through the API client (so the acting user is sent and the export is audited),
 * then hands the file to the browser.
 */
async function download(path: string, fallbackName: string): Promise<string> {
  const response = await api.get<Blob>(path, { responseType: 'blob', timeout: 5 * 60 * 1000 });
  const name = filenameFrom(response.headers['content-disposition'] as string | undefined, fallbackName);
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

export const exportService = {
  /** Findings matching the same filters as the findings list (paging is ignored). */
  findings(query: Omit<FindingQuery, 'page' | 'page_size'>, format: ExportFormat): Promise<string> {
    return download(`/exports/findings?${serializeQuery({ ...query, format })}`, `findings.${format}`);
  },

  projectReport(projectId: number): Promise<string> {
    return download(`/exports/projects/${projectId}/report`, 'project-report.html');
  },

  async list(): Promise<SavedExport[]> {
    const { data } = await api.get<SavedExport[]>('/exports');
    return data;
  },

  saved(name: string): Promise<string> {
    return download(`/exports/files/${encodeURIComponent(name)}`, name);
  },
};
