import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { endpoints, getToken, setToken, clearToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await endpoints.auth.me();
        if (!cancelled) setUser(data.user);
      } catch {
        clearToken();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const { data } = await endpoints.auth.login({ username, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    window.location.replace('/login');
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await endpoints.auth.me();
    setUser(data.user);
    return data.user;
  }, []);

  /**
   * Mirrors the backend permission model: admin holds everything implicitly.
   * The UI uses this only to hide controls — the server is the real gate.
   */
  const can = useCallback(
    (permission) => {
      if (!user) return false;
      if (user.role === 'admin') return true;
      return Boolean(user.permissions?.[permission]);
    },
    [user]
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh, can, isAdmin: user?.role === 'admin' }),
    [user, loading, login, logout, refresh, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
