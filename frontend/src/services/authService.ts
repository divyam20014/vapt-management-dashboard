import { api } from './api';
import type { CurrentUser, SetupInput } from '../types/auth';

export const authService = {
  /** Public. Includes the signed-in user when the session cookie is valid. */
  async status(): Promise<{ setup_required: boolean; user: CurrentUser | null }> {
    const { data } = await api.get<{ setup_required: boolean; user: CurrentUser | null }>('/auth/status');
    return data;
  },

  async me(): Promise<CurrentUser> {
    const { data } = await api.get<CurrentUser>('/auth/me');
    return data;
  },

  async login(email: string, password: string): Promise<CurrentUser> {
    const { data } = await api.post<CurrentUser>('/auth/login', { email, password });
    return data;
  },

  async setup(input: SetupInput): Promise<CurrentUser> {
    const { data } = await api.post<CurrentUser>('/auth/setup', input);
    return data;
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout');
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword });
  },
};
