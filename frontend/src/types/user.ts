import type { UserRole } from '../utils/constants';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  /** False until a password is set; such users can be assigned findings but cannot sign in. */
  can_sign_in: boolean;
  last_login_at: string | null;
}

export interface UserRef {
  id: number;
  name: string;
}

export interface UserInput {
  name: string;
  email: string;
  role: UserRole;
  password?: string;
}
