import { apiFetch, apiJsonSafe } from '@/lib/api';
import type { HKInfo, LogEntry } from '@/lib/types';

export const homekitApi = {
  info: () => apiJsonSafe<HKInfo>('/api/homekit'),
  recentLogs: (n = 200) => apiJsonSafe<LogEntry[]>(`/api/logs?n=${n}`),
  /** Returns raw Response so callers can inspect non-OK error JSON. */
  wakeNode: (id: string) =>
    apiFetch(`/api/nodes/${id}/wake`, { method: 'POST' }),
};
