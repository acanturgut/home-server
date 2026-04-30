import { apiJsonSafe, API_BASE } from '@/lib/api';
import type { AppInfo, LogEntry, NodeStats, SystemInfo } from '@/lib/types';

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

export interface OverviewLocation {
  city: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
  isp: string;
}

export interface OverviewWeather {
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

export interface DashboardClient {
  ip: string;
  count: number;
  last_seen: string;
  last_path: string;
  user_agent?: string;
}

export const dashboardApi = {
  system: () => apiJsonSafe<SystemInfo>('/api/system'),
  systemHistory: () => apiJsonSafe<SystemHistoryPoint[]>('/api/system/history'),
  apps: () => apiJsonSafe<AppInfo[]>('/api/apps'),
  nodes: () => apiJsonSafe<NodeRow[]>('/api/nodes'),
  nodeStats: () => apiJsonSafe<Record<string, NodeStats>>('/api/nodes/stats'),
  logs: (n = 200) => apiJsonSafe<LogEntry[]>(`/api/logs?n=${n}`),
  overview: () => apiJsonSafe<DashboardOverview>('/api/dashboard/overview'),
  cluster: () => apiJsonSafe<ClusterAggregate>('/api/dashboard/cluster'),
  clients: () => apiJsonSafe<DashboardClient[]>('/api/dashboard/clients'),
  setDeviceOverride: async (
    deviceId: string,
    o: { name?: string; room?: string; type?: string; hidden?: boolean },
  ) => {
    const r = await fetch(
      `${API_BASE}/api/home/devices/${encodeURIComponent(deviceId)}/override`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(o),
      },
    );
    if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
  },
};
