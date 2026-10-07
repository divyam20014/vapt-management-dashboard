import { api } from './api';
import type { AppSettings } from '../types/settings';

export const settingsService = {
  async get(): Promise<AppSettings> {
    const { data } = await api.get<AppSettings>('/settings');
    return data;
  },
};
