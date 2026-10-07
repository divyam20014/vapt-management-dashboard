import { api } from './api';
import type { DashboardSummary, Trends } from '../types/dashboard';

export const dashboardService = {
  /** Whole portfolio, or one project when `projectId` is given. */
  async getSummary(projectId?: number): Promise<DashboardSummary> {
    const { data } = await api.get<DashboardSummary>('/dashboard/summary', { params: projectId ? { project_id: projectId } : {} });
    return data;
  },

  async getTrends(projectId?: number): Promise<Trends> {
    const { data } = await api.get<Trends>('/dashboard/trends', { params: projectId ? { project_id: projectId } : {} });
    return data;
  },
};
