import { apiJsonSafe } from '@/lib/api';
import type { LogEntry } from '@/lib/types';

export const logsApi = {
  /** Fetch the last `n` server log entries. */
  list: (n = 500) => apiJsonSafe<LogEntry[]>(`/api/logs?n=${n}`),
};
