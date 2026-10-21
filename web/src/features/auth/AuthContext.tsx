import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { authApi, type User } from '@/features/auth/api';
import { AuthContext } from '@/features/auth/useAuth';
import { AUTH_UNAUTHORIZED_EVENT } from '@/lib/api';

/**
 * Provides the current user to descendants and reacts to global 401s
 * (see `AUTH_UNAUTHORIZED_EVENT`) by clearing the session.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi.me().then((u) => {
      setUser(u);
      setLoading(false);
    });
    const onUnauth = () => setUser(null);
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauth);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauth);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const u = await authApi.login(username, password);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
