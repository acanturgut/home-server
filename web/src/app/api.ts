import { apiFetch, apiJson, apiJsonSafe } from '@/lib/api';
import type { SystemInfo, AppInfo } from '@/lib/types';

/** App-shell HTTP calls used by global hooks (status polling, etc.). */
export const appApi = {
  getSystem: () => apiJsonSafe<SystemInfo>('/api/system'),
  getNodesStats: () => apiJsonSafe<Record<string, unknown>>('/api/nodes/stats'),
  listApps: () => apiJsonSafe<AppInfo[]>('/api/apps'),
};

export { apiFetch, apiJson, apiJsonSafe };
