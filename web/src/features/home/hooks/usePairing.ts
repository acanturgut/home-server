import { useRef, useState } from 'react';
import { useAction } from '@/hooks/useAction';

/**
 * Runs a server-side pairing handshake that resolves to a bridge token.
 * `cancel` aborts a pending (long-polling) request without an error.
 */
export function usePairing(onToken: (token: string) => void) {
  const abort = useRef<AbortController | null>(null);
  const [paired, setPaired] = useState(false);
  const { run, busy, error } = useAction(
    async (pair: (signal: AbortSignal) => Promise<string>) => {
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      setPaired(false);
      try {
        onToken(await pair(ac.signal));
        setPaired(true);
      } catch (e) {
        if (!ac.signal.aborted) throw e;
      }
    },
  );
  const cancel = () => abort.current?.abort();
  return { pair: run, cancel, busy, error, paired };
}
