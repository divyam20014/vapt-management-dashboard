import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// findBy*/waitFor give up after 1 s by default, which a busy machine can exceed while a page
// renders its (mocked) data. A longer wait only affects slow runs; failures still fail.
configure({ asyncUtilTimeout: 5000 });
import { userService } from '../services/userService';
import { authService } from '../services/authService';
import { currentUser } from './auth';

// Pages render inside AuthProvider and UsersProvider. By default a test is signed in as an Admin
// (use signInAs() from ./auth for other roles) and there are no users; tests opt in to specific users.
vi.mock('../services/userService');
vi.mock('../services/authService');
beforeEach(() => {
  vi.mocked(userService.list).mockResolvedValue([]);
  vi.mocked(authService.status).mockResolvedValue({ setup_required: false, user: currentUser('Admin') });
  vi.mocked(authService.me).mockResolvedValue(currentUser('Admin'));
  window.localStorage.clear();
});

// Recharts' ResponsiveContainer relies on ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

afterEach(() => cleanup());

// Pages are lazy-loaded (one chunk each). Importing them once up front keeps the first render in each
// test from waiting on module transformation, which can otherwise exceed the test timeout.
beforeAll(async () => {
  await Promise.all(Object.values(import.meta.glob('../pages/*.tsx')).map((load) => load()));
}, 120_000);
