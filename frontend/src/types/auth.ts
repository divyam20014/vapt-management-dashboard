import type { Permission, UserRole } from '../utils/constants';

export interface CurrentUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  /** From the server's role map. The UI hides what a role cannot do; the API enforces it. */
  permissions: Permission[];
  last_login_at: string | null;
}

export interface SetupInput {
  name: string;
  email: string;
  password: string;
}
