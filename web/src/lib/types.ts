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
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
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

export interface BuildRecord {
  action: string;
  prompt: string;
  status: string;
  duration: string;
  node: string;
  timestamp: string;
}

export interface AppInfo {
  name: string;
  icon?: string;
  port: number;
  healthcheck: string;
  route: string;
  type: string;
  status: string;
  prompt: string;
  error?: string;
  created_at: string;
  updated_at: string;
  builds?: BuildRecord[];
  dev_mode?: boolean;
  dev_running?: boolean;
}

export interface BuildTask {
  id: number;
  title: string;
  description: string;
  worker: string; // "heavy" or "light"
  nodeName?: string;
  model?: string;
  status: string; // "pending", "running", "done", "error"
  latency?: string;
}

export interface BuildEvent {
  step: string;
  message: string;
  detail?: string;
  latency?: string;
  timestamp?: string;
  tasks?: BuildTask[];
  taskId?: number;
}

export interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  summary: string;
  /** Optional grouping label rendered as a section header in the API panel. */
  group?: string;
  body?: string;
  pathParams?: string[];
  queryParams?: { name: string; default?: string }[];
}
