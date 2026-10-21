import { useState, type FormEvent } from 'react';
import { ArrowRight, CircleAlert, Loader2, Server } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/useAuth';

const FIELD = 'h-11 rounded-xl border-0 bg-muted/50 px-4 text-sm';

/**
 * Full-screen sign-in page rendered when no session is active: the server
 * mark, two fields, and a submit arrow inside the password field.
 */
export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(username.trim(), password);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh w-full bg-background text-foreground flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-xs flex flex-col items-center gap-3">
        <h1 className="sr-only">Home Server sign in</h1>
        <Server size={28} className="mb-8" aria-hidden />

        <Input
          autoFocus
          aria-label="Username"
          placeholder="Username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={busy}
          required
          className={FIELD}
        />

        <div className="relative w-full">
          <Input
            type="password"
            aria-label="Password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            required
            className={`${FIELD} pr-14`}
          />
          <button
            type="submit"
            aria-label="Sign in"
            disabled={busy || !username.trim() || !password}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 size-8 rounded-lg bg-foreground text-background flex items-center justify-center transition-opacity disabled:opacity-25">
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ArrowRight size={16} />
            )}
          </button>
        </div>

        {err && (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CircleAlert size={13} />
            {err}
          </p>
        )}
      </form>
    </div>
  );
}
