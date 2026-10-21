import { apiJson, apiJsonSafe } from '@/lib/api';

/** Persisted compute-node configuration row (GET /api/nodes). */
export interface NodeConfig {
  id: string;
  name: string;
  host: string;
  tier: string;
  gpu?: string;
  mac?: string;
  model?: string;
  temperature?: number;
}

/** Body of POST /api/nodes and PUT /api/nodes/{id} (PUT merges). */
export interface NodeInput {
  name: string;
  host: string;
  tier: string;
  gpu: string;
  mac: string;
  model: string;
  temperature: number;
}

export interface SystemConfigDTO {
  router_model: string;
  ollama_host: string;
  version: string;
  started_at: string;
  uptime_seconds: number;
  data_dir: string;
  log_dir: string;
  port: string;
  homekit_pin: string;
  nodes_count: number;
}

/** User-editable runtime settings (GET/PUT /api/settings). */
export interface RuntimeSettings {
  defaultTemperature: number;
  routerModel?: string;
}

interface HealthDTO {
  backends?: {
    ollama?: boolean;
    nodes?: { id: string; online: boolean }[];
  };
}

const send = <T>(method: string, path: string, body?: unknown) =>
  apiJson<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** Settings page HTTP calls. Mutations throw on failure. */
export const settingsApi = {
  // config / health
  getConfig: () => apiJson<SystemConfigDTO>('/api/config'),
  getHealth: () => apiJson<HealthDTO>('/api/health'),
  putConfig: (body: { router_model: string }) =>
    send<{ router_model: string }>('PUT', '/api/config', body),

  // runtime settings
  getSettings: () => apiJsonSafe<RuntimeSettings>('/api/settings'),
  putSettings: (body: RuntimeSettings) =>
    send<RuntimeSettings>('PUT', '/api/settings', body),
  resetSettings: () => send<RuntimeSettings>('POST', '/api/settings/reset'),

  // nodes (power and model load/unload live in lib/nodes)
  listNodes: () => apiJson<NodeConfig[] | null>('/api/nodes'),
  getNodeModels: (id: string) =>
    apiJsonSafe<{ models?: string[] }>(`/api/nodes/${id}/models`),
  addNode: (body: NodeInput) => send<NodeConfig>('POST', '/api/nodes', body),
  updateNode: (id: string, body: NodeInput) =>
    send<NodeConfig>('PUT', `/api/nodes/${id}`, body),
  deleteNode: (id: string) => send<unknown>('DELETE', `/api/nodes/${id}`),
};
