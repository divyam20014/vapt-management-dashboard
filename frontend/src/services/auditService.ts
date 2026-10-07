import { api } from './api';
import type { Page } from '../types/api';
import type { AuditActionOption, AuditEntry, AuditQuery } from '../types/audit';

export const auditService = {
  async list(query: AuditQuery): Promise<Page<AuditEntry>> {
    const { data } = await api.get<Page<AuditEntry>>('/audit-logs', { params: query });
    return data;
  },

  async actions(): Promise<AuditActionOption[]> {
    const { data } = await api.get<AuditActionOption[]>('/audit-logs/actions');
    return data;
  },
};
