import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  KeyRound,
  Loader2,
  LogOut,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  SettingsCard,
  SkeletonRows,
} from '@/components/ui/settings-rows';
import { authApi, type Role, type User } from '@/features/auth/api';
import { useAuth } from '@/features/auth/useAuth';

/**
 * Settings → Users tab. Lists accounts (admin only), supports add / role
 * change / password reset / delete, and exposes self-service password change
 * + sign-out for the current viewer.
 */
export function UsersSettingsTab() {
  const { user: me, logout } = useAuth();
  const isAdmin = me?.role === 'admin';

  const [users, setUsers] = useState<User[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Add-user form.
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<Role>('viewer');

  // Self-service change password.
  const [curPw, setCurPw] = useState('');
  const [nextPw, setNextPw] = useState('');
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      authApi.users.list().then(
        (list) => {
          setUsers(list);
          setErr(null);
        },
        (e) => {
          setErr(e instanceof Error ? e.message : String(e));
          setUsers([]);
        },
      ),
    [],
  );

  // The user list is only rendered for admins, so only admins fetch it.
  useEffect(() => {
    if (isAdmin) void refresh();
  }, [isAdmin, refresh]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await authApi.users.create(newUsername.trim(), newPassword, newRole);
      setNewUsername('');
      setNewPassword('');
      setNewRole('viewer');
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  };

  const onSetRole = async (u: User, role: Role) => {
    setBusy(true);
    try {
      await authApi.users.setRole(u.id, role);
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  };

  const onResetPassword = async (u: User) => {
    const pw = window.prompt(`Set new password for ${u.username}:`);
    if (!pw) return;
    setBusy(true);
    try {
      await authApi.users.setPassword(u.id, pw);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (u: User) => {
    if (!window.confirm(`Delete user "${u.username}"?`)) return;
    setBusy(true);
    try {
      await authApi.users.delete(u.id);
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  };

  const onChangeOwnPassword = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setPwMsg(null);
    try {
      await authApi.changePassword(curPw, nextPw);
      setCurPw('');
      setNextPw('');
      setPwMsg('Password updated.');
    } catch (ex) {
      setPwMsg(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Account self-service. */}
      <SettingsCard
        title="My account"
        icon={<UserCog className="h-3.5 w-3.5" />}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => logout()}
            className="h-7 px-2 text-xs">
            <LogOut className="mr-1 h-3.5 w-3.5" />
            Sign out
          </Button>
        }>
        <div className="text-xs text-muted-foreground">
          Signed in as{' '}
          <span className="font-medium text-foreground">{me?.username}</span> (
          <span className="font-medium">{me?.role}</span>)
        </div>
        <form
          onSubmit={onChangeOwnPassword}
          className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center">
          <Input
            type="password"
            placeholder="Current password"
            value={curPw}
            onChange={(e) => setCurPw(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="New password"
            value={nextPw}
            onChange={(e) => setNextPw(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy} size="sm">
            {busy ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <KeyRound className="mr-1 h-3.5 w-3.5" />
            )}
            Change
          </Button>
        </form>
        {pwMsg && (
          <p className="text-xs text-muted-foreground">{pwMsg}</p>
        )}
      </SettingsCard>

      {/* Admin-only: user management. */}
      {isAdmin && (
        <SettingsCard
          title={`Users (${users?.length ?? 0})`}
          icon={<Users className="h-3.5 w-3.5" />}>
          {err && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {err}
            </p>
          )}

          {users === null ? (
            <SkeletonRows rows={3} block />
          ) : users.length === 0 ? (
            <p className="text-xs text-muted-foreground">No users.</p>
          ) : (
            <ul className="divide-y divide-border/20 rounded-md border border-border/20">
              {users.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                  <ShieldCheck
                    className={
                      u.role === 'admin'
                        ? 'h-3.5 w-3.5 text-amber-400'
                        : 'h-3.5 w-3.5 text-muted-foreground/60'
                    }
                  />
                  <span className="font-medium">{u.username}</span>
                  <select
                    className="ml-auto h-7 rounded-md border border-border/40 bg-background px-2 text-xs"
                    value={u.role}
                    disabled={busy || u.id === me?.id}
                    onChange={(e) => onSetRole(u, e.target.value as Role)}>
                    <option value="admin">admin</option>
                    <option value="viewer">viewer</option>
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    disabled={busy}
                    onClick={() => onResetPassword(u)}
                    title="Reset password">
                    <KeyRound className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-destructive hover:text-destructive"
                    disabled={busy || u.id === me?.id}
                    onClick={() => onDelete(u)}
                    title="Delete user">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={onCreate}
            className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-center pt-2 border-t border-border/20">
            <Input
              placeholder="username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="password (min 8)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <select
              className="h-9 rounded-md border border-border/40 bg-background px-2 text-xs"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}>
              <option value="viewer">viewer</option>
              <option value="admin">admin</option>
            </select>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1 h-3.5 w-3.5" />
              )}
              Add
            </Button>
          </form>
        </SettingsCard>
      )}
    </div>
  );
}
