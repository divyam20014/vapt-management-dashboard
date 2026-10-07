import { api } from './api';
import type { GuidelineDetail, RemediationLibrary } from '../types/remediation';

export const remediationService = {
  async list(params: { search?: string; category?: string } = {}): Promise<RemediationLibrary> {
    const { data } = await api.get<RemediationLibrary>('/remediation', { params });
    return data;
  },

  async get(slug: string): Promise<GuidelineDetail> {
    const { data } = await api.get<GuidelineDetail>(`/remediation/${encodeURIComponent(slug)}`);
    return data;
  },
};
