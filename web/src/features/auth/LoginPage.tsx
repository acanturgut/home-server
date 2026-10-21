import { useState, type FormEvent } from 'react';
import { Server } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/useAuth';
import { useAction } from '@/hooks/useAction';

/** Full-screen sign-in, shown while there is no session. */
export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { run, busy, error } = useAction(login);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(username.trim(), password);
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <form onSubmit={submit} className="w-full max-w-xs space-y-4">
        <div className="flex flex-col items-center gap-3 pb-4">
          <Server className="size-7" aria-hidden />
          <h1 className="text-base font-medium">Home Server</h1>
        </div>
        <Field label="Username">
          <Input
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" loading={busy}>
          Sign in
        </Button>
      </form>
    </main>
  );
}
