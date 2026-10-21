import { apiJsonSafe } from '@/lib/api';

export interface SystemInfo {
  hostname: string;
  uptime_seconds: number;
  os: string;
  arch: string;
  cpu: { cores: number; used_pct: number };
  memory: {
    total_mb: number;
    used_mb: number;
    free_mb: number;
    used_pct: number;
  };
  disk: {
    total_gb: number;
    used_gb: number;
    free_gb: number;
    used_pct: number;
    path: string;
  };
}

/** Cluster-wide averages from /api/dashboard/cluster (status bar). */
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

/** App-shell HTTP calls (status bar polling). */
export const appApi = {
  system: () => apiJsonSafe<SystemInfo>('/api/system'),
  cluster: () => apiJsonSafe<ClusterAggregate>('/api/dashboard/cluster'),
};
