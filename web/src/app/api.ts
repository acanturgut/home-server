import { apiJsonSafe } from '@/lib/api';
import type { SystemInfo } from '@/lib/types';

/** App-shell HTTP calls used by global hooks (status polling, etc.). */
export const appApi = {
  getSystem: () => apiJsonSafe<SystemInfo>('/api/system'),
  getNodesStats: () => apiJsonSafe<Record<string, unknown>>('/api/nodes/stats'),
};
