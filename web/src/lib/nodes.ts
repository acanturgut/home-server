import { apiJson, apiJsonSafe } from '@/lib/api';

/** Live telemetry one compute node's agent reports (GET /api/nodes/stats). */
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
  nvme_temp?: number;
  uptime_secs: number;
  last_seen: string;
}

/** One minute of a node's history (GET /api/nodes/{id}/history). */
export interface NodeSample {
  t: string;
  cpu: number;
  mem: number;
  gpu?: number;
  cpu_temp?: number;
  gpu_temp?: number;
  nvme_temp?: number;
}

export type NodeRange = '24h' | '168h';

const post = <T>(path: string, body?: unknown) =>
  apiJson<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/**
 * Compute-node power and model controls shared by Dashboard, Settings and
 * HomeKit. Mutations throw on failure, so callers must surface the error.
 */
export const nodesApi = {
  stats: () => apiJsonSafe<Record<string, NodeStats>>('/api/nodes/stats'),
  history: (id: string, range: NodeRange) =>
    apiJsonSafe<{ samples: NodeSample[] }>(
      `/api/nodes/${id}/history?range=${range}`,
    ),
  /** Latest system warnings and errors, oldest first. */
  logs: (id: string) =>
    apiJsonSafe<{ lines: string[] }>(`/api/nodes/${id}/logs`),
  /** Sends a Wake-on-LAN packet. */
  wake: (id: string) =>
    post<{ status: 'sent'; node: string }>(`/api/nodes/${id}/wake`),
  /** Queues a shutdown for the node's agent; it runs on the agent's next poll. */
  shutdown: (id: string) =>
    post<{ status: 'queued'; node: string }>(`/api/nodes/${id}/shutdown`),
  loadModel: (id: string, model: string) =>
    post<unknown>(`/api/nodes/${id}/models/load`, { model }),
  unloadModel: (id: string, model: string) =>
    post<unknown>(`/api/nodes/${id}/models/unload`, { model }),
};
