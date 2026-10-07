import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setActingUserId } from '../services/api';
import { userService } from '../services/userService';
import type { User } from '../types/user';

const STORAGE_KEY = 'vapt.actingUserId';

function readStoredId(): number | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && /^\d+$/.test(value) ? Number(value) : null;
  } catch {
    return null;
  }
}

function storeId(id: number | null) {
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // Storage unavailable (private mode): the selection lasts for this session only.
  }
}

interface ActingUserContextValue {
  /** All users (active and inactive), from the API. */
  users: User[];
  activeUsers: User[];
  actingUser: User | null;
  setActingUser: (id: number | null) => void;
  reloadUsers: () => void;
  loaded: boolean;
}

const ActingUserContext = createContext<ActingUserContextValue | null>(null);

/**
 * Who the UI is acting as. Until authentication exists (Phase 6) this is chosen by the person
 * using the app; the choice is remembered per browser and sent with every request.
 */
export function ActingUserProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(readStoredId);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    userService
      .list()
      .then((result) => {
        if (active) setUsers(Array.isArray(result) ? result : []);
      })
      .catch(() => {
        if (active) setUsers([]);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const actingUser = useMemo(
    () => users.find((user) => user.id === selectedId && user.active) ?? null,
    [users, selectedId],
  );

  // Keep the request header in sync; forget a stored user that no longer exists or was deactivated.
  useEffect(() => {
    setActingUserId(actingUser?.id ?? null);
    if (loaded && selectedId !== null && !actingUser) {
      setSelectedId(null);
      storeId(null);
    }
  }, [actingUser, loaded, selectedId]);

  const setActingUser = useCallback((id: number | null) => {
    setSelectedId(id);
    storeId(id);
  }, []);

  const reloadUsers = useCallback(() => setReloadToken((token) => token + 1), []);

  const value = useMemo(
    () => ({ users, activeUsers: users.filter((user) => user.active), actingUser, setActingUser, reloadUsers, loaded }),
    [users, actingUser, setActingUser, reloadUsers, loaded],
  );
  return <ActingUserContext.Provider value={value}>{children}</ActingUserContext.Provider>;
}

export function useActingUser(): ActingUserContextValue {
  const context = useContext(ActingUserContext);
  if (!context) throw new Error('useActingUser must be used inside ActingUserProvider');
  return context;
}
