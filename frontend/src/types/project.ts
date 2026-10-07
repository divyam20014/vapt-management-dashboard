import type { ProjectEnvironment, ProjectStatus } from '../utils/constants';

export interface Project {
  id: number;
  name: string;
  application_name: string | null;
  description: string | null;
  environment: ProjectEnvironment | null;
  application_url: string | null;
  owner: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface ProjectInput {
  name: string;
  application_name: string;
  description: string;
  environment: ProjectEnvironment | '';
  application_url: string;
  owner: string;
  status: ProjectStatus;
}

export type ProjectSortField = 'name' | 'status' | 'environment' | 'created_at' | 'updated_at';

export interface ProjectListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: ProjectStatus;
  environment?: ProjectEnvironment;
  sort_by?: ProjectSortField;
  sort_order?: 'asc' | 'desc';
}
