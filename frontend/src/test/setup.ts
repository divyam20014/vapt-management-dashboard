import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// findBy*/waitFor give up after 1 s by default, which a busy machine can exceed while a page
// renders its (mocked) data. A longer wait only affects slow runs; failures still fail.
configure({ asyncUtilTimeout: 5000 });
import { userService } from '../services/userService';

// Every page renders inside ActingUserProvider, which loads users. Tests opt in to specific users.
vi.mock('../services/userService');
beforeEach(() => {
  vi.mocked(userService.list).mockResolvedValue([]);
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
