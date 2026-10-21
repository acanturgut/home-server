import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { KeyRound, LogOut, Trash2, UserCog, Users } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { authApi, type Role, type User } from '@/features/auth/api';
import { useAuth } from '@/features/auth/useAuth';
import { useAction } from '@/hooks/useAction';
import { useConfirm } from '@/hooks/useConfirm';
import { errorMessage, plural } from '@/lib/format';

const fail = (what: string, e: unknown) =>
  toast(`${what} failed`, { tone: 'error', description: errorMessage(e) });

/** Settings → Account: your password and sign-out; admins also manage users. */
export function UsersSettingsTab() {
  const { user } = useAuth();
  return (
    <div className="space-y-4">
      <MyAccountCard />
      {user?.role === 'admin' && <UserAdminCard />}
    </div>
  );
}

/** Account list, roles, password resets and new users (admin only). */
function UserAdminCard() {
  const { user: me } = useAuth();
  const confirm = useConfirm();
  const [users, setUsers] = useState<User[] | null>(null);
  const [resetFor, setResetFor] = useState<User | null>(null);

  const fetchUsers = useCallback(async () => {
    setUsers(await authApi.users.list());
  }, []);
  const { run: refresh, error: loadError } = useAction(fetchUsers);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSetRole = async (u: User, role: Role) => {
    try {
      await authApi.users.setRole(u.id, role);
      await refresh();
    } catch (e) {
      fail('Changing the role', e);
    }
  };

  const onDelete = async (u: User) => {
    const ok = await confirm({
      title: `Delete ${u.username}?`,
      body: 'Their sessions end and they can no longer sign in.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await authApi.users.delete(u.id);
      await refresh();
    } catch (e) {
      fail('Deleting the user', e);
    }
  };

  return (
    <>
      <Card className="space-y-3">
        <CardHeader
          title="Users"
          icon={<Users />}
          description={users && plural(users.length, 'account')}
        />
        {loadError && <Alert>{loadError}</Alert>}
        {!users ? (
          !loadError && <SkeletonRows rows={3} block />
        ) : (
          <ul className="divide-y rounded-md border">
            {users.map((u) => {
              const self = u.id === me?.id;
              return (
                <li
                  key={u.id}
                  className="flex items-center gap-2 py-1.5 pr-1.5 pl-3"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {u.username}
                  </span>
                  {self && <Badge>You</Badge>}
                  <Select
                    selectSize="sm"
                    aria-label={`Role for ${u.username}`}
                    value={u.role}
                    disabled={self}
                    onChange={(e) => onSetRole(u, e.target.value as Role)}
                    className="w-auto"
                  >
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </Select>
                  <IconButton
                    icon={<KeyRound />}
                    label={`Reset password for ${u.username}`}
                    onClick={() => setResetFor(u)}
                  />
                  <IconButton
                    icon={<Trash2 />}
                    label={`Delete ${u.username}`}
                    disabled={self}
                    onClick={() => onDelete(u)}
                  />
                </li>
              );
            })}
          </ul>
        )}
        <AddUserForm onAdded={refresh} />
      </Card>

      {/* Keyed so each open starts with an empty field and no error. */}
      <ResetPasswordDialog
        key={resetFor?.id}
        user={resetFor}
        onClose={() => setResetFor(null)}
      />
    </>
  );
}

function MyAccountCard() {
  const { user: me, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useAction(async () => {
    await authApi.changePassword(current, next);
    setCurrent('');
    setNext('');
    toast('Password updated', { tone: 'success' });
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void change.run();
  };

  return (
    <Card className="space-y-3">
      <CardHeader
        title="My account"
        icon={<UserCog />}
        description={`Signed in as ${me?.username} (${me?.role})`}
        actions={
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            <LogOut />
            Sign out
          </Button>
        }
      />
      <form
        onSubmit={submit}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <Field label="Current password" className="flex-1">
          <Input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </Field>
        <Field label="New password" className="flex-1">
          <Input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" variant="secondary" loading={change.busy}>
          Change password
        </Button>
      </form>
      {change.error && <Alert>{change.error}</Alert>}
    </Card>
  );
}

function AddUserForm({ onAdded }: { onAdded: () => Promise<unknown> }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const add = useAction(async () => {
    await authApi.users.create(username.trim(), password, role);
    setUsername('');
    setPassword('');
    setRole('viewer');
    await onAdded();
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void add.run();
  };

  return (
    <form onSubmit={submit} className="space-y-3 border-t pt-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Username" className="flex-1">
          <Input
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </Field>
        <Field label="Password" className="flex-1">
          <Input
            type="password"
            autoComplete="new-password"
            minLength={8}
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Field label="Role">
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        <Button type="submit" loading={add.busy}>
          Add user
        </Button>
      </div>
      {add.error && <Alert>{add.error}</Alert>}
    </form>
  );
}

/** Admin sets a new password for `user`; open while `user` is set. */
function ResetPasswordDialog({
  user,
  onClose,
}: {
  user: User | null;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const save = useAction(async () => {
    if (!user) return;
    await authApi.users.setPassword(user.id, password);
    toast(`Password reset for ${user.username}`, { tone: 'success' });
    onClose();
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save.run();
  };

  return (
    <Dialog
      open={user !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Reset password"
      description={user && `Set a new password for ${user.username}.`}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password">
          <Input
            type="password"
            autoComplete="new-password"
            minLength={8}
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        {save.error && <Alert>{save.error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.busy}>
            Set password
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
