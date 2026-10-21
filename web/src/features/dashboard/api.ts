import { apiJson, apiJsonSafe } from '@/lib/api';
import type { LogEntry } from '@/lib/types';

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

export interface NodeModelStatus {
  id: string;
  state: string;
  type?: string;
  loaded: boolean;
}

export const dashboardApi = {
  systemHistory: () => apiJsonSafe<SystemHistoryPoint[]>('/api/system/history'),
  nodes: () => apiJsonSafe<NodeRow[]>('/api/nodes'),
  logs: (n = 200) => apiJsonSafe<LogEntry[]>(`/api/logs?n=${n}`),
  overview: () => apiJsonSafe<DashboardOverview>('/api/dashboard/overview'),
  /** Throws when the node's model API is unreachable. */
  nodeModelsStatus: (id: string) =>
    apiJson<{ models?: NodeModelStatus[] | null }>(
      `/api/nodes/${id}/models/status`,
    ),
};
