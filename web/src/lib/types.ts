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

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  request_id?: string;
  route?: string;
  model?: string;
  node?: string;
  tier?: string;
  latency?: string;
}

export interface NodeStats {
  node_id: string;
  hostname: string;
  os: string;
  arch: string;
  cpu_model: string;
  cpu_cores: number;
  cpu_usage: number;
  mem_total_gb: number;
  mem_used_gb: number;
  mem_pct: number;
  disk_total_gb: number;
  disk_used_gb: number;
  disk_pct: number;
  gpu_name?: string;
  gpu_usage?: number;
  gpu_mem_total_mb?: number;
  gpu_mem_used_mb?: number;
  gpu_temp?: number;
  cpu_temp?: number;
  uptime_secs: number;
  last_seen: string;
}

export interface HKAccessory {
  id: string;
  name: string;
  mac: string;
  host: string;
}

export interface HKInfo {
  bridge: string;
  pin: string;
  port: number;
  setup_uri: string;
  accessories: HKAccessory[] | null;
}
