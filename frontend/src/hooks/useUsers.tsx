import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { userService } from '../services/userService';
import type { User } from '../types/user';

interface UsersContextValue {
  /** All users (active and inactive), from the API: assignee lists, filters and user management. */
  users: User[];
  activeUsers: User[];
  reloadUsers: () => void;
  loaded: boolean;
}

const UsersContext = createContext<UsersContextValue | null>(null);

/** Loaded once per signed-in session (mounted inside the authenticated layout). */
export function UsersProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loaded, setLoaded] = useState(false);
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

  const reloadUsers = useCallback(() => setReloadToken((token) => token + 1), []);

  const value = useMemo(
    () => ({ users, activeUsers: users.filter((user) => user.active), reloadUsers, loaded }),
    [users, reloadUsers, loaded],
  );
  return <UsersContext.Provider value={value}>{children}</UsersContext.Provider>;
}

export function useUsers(): UsersContextValue {
  const context = useContext(UsersContext);
  if (!context) throw new Error('useUsers must be used inside UsersProvider');
  return context;
}
