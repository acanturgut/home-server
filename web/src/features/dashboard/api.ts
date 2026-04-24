import { apiJsonSafe } from '@/lib/api';
import type { AppInfo, NodeStats, SystemInfo } from '@/lib/types';

export interface SystemHistoryPoint {
  t: string;
  cpu: number;
  mem: number;
  disk: number;
  mem_mb: number;
  mem_max: number;
}

export interface NodeRow {
  id: string;
  name: string;
  host: string;
  mac?: string;
}

export const dashboardApi = {
  system: () => apiJsonSafe<SystemInfo>('/api/system'),
  systemHistory: () => apiJsonSafe<SystemHistoryPoint[]>('/api/system/history'),
  apps: () => apiJsonSafe<AppInfo[]>('/api/apps'),
  nodes: () => apiJsonSafe<NodeRow[]>('/api/nodes'),
  nodeStats: () => apiJsonSafe<Record<string, NodeStats>>('/api/nodes/stats'),
};
