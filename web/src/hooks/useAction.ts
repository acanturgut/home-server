import { useCallback, useState } from 'react';
import { errorMessage } from '@/lib/format';

/**
 * Wraps an async action with busy / error state. `run` resolves to the
 * action's result, or `undefined` when it threw (the message lands in
 * `error`, which the next `run` clears).
 */
export function useAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): {
  run: (...args: A) => Promise<R | undefined>;
  busy: boolean;
  error: string | null;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (...args: A) => {
      setBusy(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e) {
        setError(errorMessage(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [fn],
  );
  return { run, busy, error };
}
