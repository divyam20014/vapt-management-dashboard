import { projectService } from './projectService';
import type { Page } from '../types/api';
import type { Project } from '../types/project';

const PAGE_SIZE = 100;
/** Selectors stop after this many projects; `total` still reports the real count. */
export const MAX_PROJECT_OPTIONS = 2000;

/** All projects by name, for selectors and filters (the API pages at 100). */
export async function listProjectOptions(): Promise<Page<Project>> {
  const items: Project[] = [];
  let total = 0;
  for (let page = 1; items.length < MAX_PROJECT_OPTIONS; page += 1) {
    const result = await projectService.list({ page, page_size: PAGE_SIZE, sort_by: 'name', sort_order: 'asc' });
    items.push(...result.items);
    total = result.total;
    if (items.length >= total || result.items.length === 0) break;
  }
  return { items, total, page: 1, page_size: items.length };
}
