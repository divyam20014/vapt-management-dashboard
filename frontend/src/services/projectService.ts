import { api } from './api';
import type { Page } from '../types/api';
import type { Project, ProjectInput, ProjectListParams } from '../types/project';

/** Converts form values to the API payload; empty optional fields are sent as null. */
function toPayload(input: ProjectInput) {
  const optional = (value: string) => (value.trim() === '' ? null : value.trim());
  return {
    name: input.name.trim(),
    application_name: optional(input.application_name),
    description: optional(input.description),
    environment: input.environment === '' ? null : input.environment,
    application_url: optional(input.application_url),
    owner: optional(input.owner),
    status: input.status,
  };
}

export const projectService = {
  async list(params: ProjectListParams = {}): Promise<Page<Project>> {
    const { data } = await api.get<Page<Project>>('/projects', { params });
    return data;
  },

  async get(id: number): Promise<Project> {
    const { data } = await api.get<Project>(`/projects/${id}`);
    return data;
  },

  async create(input: ProjectInput): Promise<Project> {
    const { data } = await api.post<Project>('/projects', toPayload(input));
    return data;
  },

  async update(id: number, input: ProjectInput): Promise<Project> {
    const { data } = await api.put<Project>(`/projects/${id}`, toPayload(input));
    return data;
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/projects/${id}`);
  },
};
