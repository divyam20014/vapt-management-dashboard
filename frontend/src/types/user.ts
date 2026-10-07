import type { UserRole } from '../utils/constants';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  created_at: string;
}

export interface UserRef {
  id: number;
  name: string;
}

export interface UserInput {
  name: string;
  email: string;
  role: UserRole;
}
