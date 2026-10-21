import { apiFetch, apiJson, apiJsonSafe } from '@/lib/api';
import type { LogEntry, NodeStats } from '@/lib/types';

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

interface OverviewLocation {
  city: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
  isp: string;
}

interface OverviewWeather {
  temp: number;
  feels_like: number;
  humidity: number;
  wind: number;
  is_day: boolean;
  code: number;
  description: string;
}

export interface DashboardOverview {
  hostname: string;
  local_ip: string;
  public_ip: string;
  location: OverviewLocation | null;
  weather: OverviewWeather | null;
  updated: string;
}

export interface ClusterAggregate {
  nodes_online: number;
  nodes_total: number;
  cpu_avg: number;
  cpu_temp_avg: number;
  mem_used_gb: number;
  mem_total_gb: number;
  gpu_count: number;
  gpu_avg: number;
  gpu_temp_avg: number;
  vram_used_mb: number;
  vram_total_mb: number;
}

export interface NodeModelStatus {
  id: string;
  state: string;
  type?: string;
  loaded: boolean;
}

export const dashboardApi = {
  systemHistory: () => apiJsonSafe<SystemHistoryPoint[]>('/api/system/history'),
  nodes: () => apiJsonSafe<NodeRow[]>('/api/nodes'),
  nodeStats: () => apiJsonSafe<Record<string, NodeStats>>('/api/nodes/stats'),
  logs: (n = 200) => apiJsonSafe<LogEntry[]>(`/api/logs?n=${n}`),
  overview: () => apiJsonSafe<DashboardOverview>('/api/dashboard/overview'),
  cluster: () => apiJsonSafe<ClusterAggregate>('/api/dashboard/cluster'),

  // node power + model controls (cluster cards)
  wakeNode: (id: string) =>
    apiFetch(`/api/nodes/${id}/wake`, { method: 'POST' }),
  shutdownNode: (id: string) =>
    apiFetch(`/api/nodes/${id}/shutdown`, { method: 'POST' }),
  nodeModelsStatus: (id: string) =>
    apiJsonSafe<{ models?: NodeModelStatus[] }>(
      `/api/nodes/${id}/models/status`,
    ),
  loadNodeModel: (nodeId: string, model: string) =>
    apiJson<unknown>(`/api/nodes/${nodeId}/models/load`, {
      method: 'POST',
      body: JSON.stringify({ model }),
    }),
  unloadNodeModel: (nodeId: string, model: string) =>
    apiJson<unknown>(`/api/nodes/${nodeId}/models/unload`, {
      method: 'POST',
      body: JSON.stringify({ model }),
    }),
};
