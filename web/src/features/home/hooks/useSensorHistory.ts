import { useEffect, useState } from 'react';
import {
  homeApi,
  type HistoryRange,
  type SensorSample,
} from '@/features/home/api';

type History = Record<string, SensorSample[]>;

const NONE: History = {};

/**
 * Samples for each sensor over `range`, refetched when the range or the
 * set of sensors changes (or on `reload`). Keeps showing the previous data
 * while a new request is pending.
 */
export function useSensorHistory(ids: string[], range: HistoryRange) {
  const idsKey = ids.join('\n');
  const [nonce, setNonce] = useState(0);
  const request = `${range}|${nonce}|${idsKey}`;
  const [result, setResult] = useState<{
    request: string;
    history: History;
  } | null>(null);

  useEffect(() => {
    let current = true;
    const list = idsKey ? idsKey.split('\n') : [];
    void Promise.all(
      list.map((id) =>
        homeApi.history(id, range).then((r) => [id, r?.samples ?? []] as const),
      ),
    ).then((entries) => {
      if (current) setResult({ request, history: Object.fromEntries(entries) });
    });
    return () => {
      current = false;
    };
  }, [idsKey, range, request]);

  return {
    history: result?.history ?? NONE,
    loading: result?.request !== request,
    reload: () => setNonce((n) => n + 1),
  };
}
