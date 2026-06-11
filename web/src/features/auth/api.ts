import { apiJson } from '@/lib/api';

/** Permission tiers. */
export type Role = 'admin' | 'viewer';

/** A user account as returned by the API (no password fields). */
export interface User {
  id: string;
  username: string;
  role: Role;
  created_at?: string;
  updated_at?: string;
}

/** REST surface for authentication and user management. */
export const authApi = {
  /** Returns the current logged-in user, or `null` if unauthenticated. */
  async me(): Promise<User | null> {
    try {
      const r = await apiJson<{ user: User }>('/api/auth/me');
      return r.user;
    } catch {
      return null;
    }
  },
  /** Submits credentials; on success the session cookie is set by the server. */
  async login(username: string, password: string): Promise<User> {
    const r = await apiJson<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    return r.user;
  },
  async logout(): Promise<void> {
    await apiJson('/api/auth/logout', { method: 'POST' });
  },
  async changePassword(current: string, next: string): Promise<void> {
    await apiJson('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current, new: next }),
    });
  },
  users: {
    list: () => apiJson<User[]>('/api/auth/users'),
    create: (username: string, password: string, role: Role) =>
      apiJson<User>('/api/auth/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, role }),
      }),
    setRole: (id: string, role: Role) =>
      apiJson(`/api/auth/users/${encodeURIComponent(id)}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),
    setPassword: (id: string, next: string) =>
      apiJson(`/api/auth/users/${encodeURIComponent(id)}/password`, {
        method: 'PUT',
        body: JSON.stringify({ new: next }),
      }),
    delete: (id: string) =>
      apiJson(`/api/auth/users/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
  },
};
