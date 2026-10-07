import type { Project } from '../types/project';
import type { Page } from '../types/api';

/** Test-only API response builders. Never imported by application code. */
export function buildProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 1,
    name: 'Customer Portal',
    application_name: 'Portal Web',
    description: null,
    environment: 'Production',
    application_url: null,
    owner: 'QA Team',
    status: 'Active',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    ...overrides,
  };
}

export function pageOf<T>(items: T[]): Page<T> {
  return { items, total: items.length, page: 1, page_size: 20 };
}
