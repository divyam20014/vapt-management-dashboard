import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onUnauthorized } from '../services/api';
import { authService } from '../services/authService';
import type { CurrentUser, SetupInput } from '../types/auth';
import type { Permission } from '../utils/constants';

type AuthState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'setup' }
  | { kind: 'signed-out'; reason?: string }
  | { kind: 'signed-in'; user: CurrentUser };

interface AuthContextValue {
  state: AuthState;
  user: CurrentUser | null;
  /** Whether the signed-in user's role allows an action. The server enforces the same rule. */
  can: (permission: Permission) => boolean;
  login: (email: string, password: string) => Promise<void>;
  setup: (input: SetupInput) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Who is signed in. The session itself is an HttpOnly cookie the browser sends; it is never read here. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ kind: 'loading' });
  const [token, setToken] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { setup_required, user } = await authService.status();
        if (!active) return;
        if (setup_required) setState({ kind: 'setup' });
        else if (user) setState({ kind: 'signed-in', user });
        else setState({ kind: 'signed-out' });
      } catch (err) {
        if (active) setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unable to reach the server.' });
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  // Any API call that finds the session gone (expired, signed out elsewhere, account deactivated) returns to sign-in.
  useEffect(() => {
    onUnauthorized(() => setState((current) => (current.kind === 'signed-in' ? { kind: 'signed-out', reason: 'Your session has ended. Sign in again.' } : current)));
    return () => onUnauthorized(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const user = await authService.login(email, password);
    setState({ kind: 'signed-in', user });
  }, []);

  const setup = useCallback(async (input: SetupInput) => {
    const user = await authService.setup(input);
    setState({ kind: 'signed-in', user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setState({ kind: 'signed-out' });
    }
  }, []);

  const refresh = useCallback(() => setToken((t) => t + 1), []);

  const value = useMemo<AuthContextValue>(() => {
    const user = state.kind === 'signed-in' ? state.user : null;
    return {
      state,
      user,
      can: (permission) => !!user?.permissions.includes(permission),
      login,
      setup,
      logout,
      refresh,
    };
  }, [state, login, setup, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
