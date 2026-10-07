import { vi } from 'vitest';
import { authService } from '../services/authService';
import { PERMISSIONS, type Permission, type UserRole } from '../utils/constants';
import type { CurrentUser } from '../types/auth';

const ALL = Object.values(PERMISSIONS) as Permission[];  // Admin: everything, including records.delete

/** Test copy of the server's role map (backend/app/core/permissions.py); the server is what enforces it. */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  Admin: ALL,
  'Security Analyst': [
    PERMISSIONS.read,
    PERMISSIONS.export,
    PERMISSIONS.projectsWrite,
    PERMISSIONS.reportsUpload,
    PERMISSIONS.findingsUpdate,
    PERMISSIONS.duplicatesDecide,
  ],
  Viewer: [PERMISSIONS.read, PERMISSIONS.export],
};

export function currentUser(role: UserRole = 'Admin', overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 1,
    name: role === 'Admin' ? 'Test Admin' : `Test ${role}`,
    email: 'tester@example.test',
    role,
    permissions: ROLE_PERMISSIONS[role],
    last_login_at: null,
    ...overrides,
  };
}

/** Every test starts signed in as an Admin (see setup.ts); call this to render as another role. */
export function signInAs(role: UserRole, overrides: Partial<CurrentUser> = {}): CurrentUser {
  const user = currentUser(role, overrides);
  vi.mocked(authService.status).mockResolvedValue({ setup_required: false, user });
  vi.mocked(authService.me).mockResolvedValue(user);
  return user;
}
