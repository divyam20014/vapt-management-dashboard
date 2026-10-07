import { api } from './api';
import type { User, UserInput } from '../types/user';

export const userService = {
  async list(): Promise<User[]> {
    const { data } = await api.get<User[]>('/users');
    return data;
  },

  async create(input: UserInput): Promise<User> {
    const { data } = await api.post<User>('/users', input);
    return data;
  },

  async update(id: number, change: Partial<Omit<UserInput, 'password'>> & { active?: boolean }): Promise<User> {
    const { data } = await api.put<User>(`/users/${id}`, change);
    return data;
  },

  /** Admin only: set or reset a password. The user is signed out everywhere. */
  async setPassword(id: number, password: string): Promise<User> {
    const { data } = await api.put<User>(`/users/${id}/password`, { password });
    return data;
  },
};
