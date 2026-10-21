import { apiFetch, apiJson, apiJsonSafe } from '@/lib/api';

/** Persisted compute-node configuration row. */
export interface NodeConfig {
  id: string;
  name: string;
  host: string;
  tier: string;
  gpu?: string;
  mac?: string;
  model?: string;
  online?: boolean;
  temperature?: number | null;
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

interface HealthDTO {
  backends?: {
    ollama?: boolean;
    nodes?: NodeConfig[];
  };
}

/** Settings page HTTP calls. */
export const settingsApi = {
  // config / health
  getConfig: () => apiJson<SystemConfigDTO>('/api/config'),
  getHealth: () => apiJson<HealthDTO>('/api/health'),
  putConfig: (body: { router_model: string }) =>
    apiJson<SystemConfigDTO>('/api/config', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  // runtime settings
  getSettings: () => apiJsonSafe<Record<string, unknown>>('/api/settings'),
  putSettings: (body: unknown) =>
    apiJson<Record<string, unknown>>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  resetSettings: () =>
    apiJson<Record<string, unknown>>('/api/settings/reset', { method: 'POST' }),

  // nodes
  getNodeModels: (id: string) =>
    apiJsonSafe<{ models?: string[] }>(`/api/nodes/${id}/models`),
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
  updateNode: (id: string, body: unknown) =>
    apiFetch(`/api/nodes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteNode: (id: string) =>
    apiFetch(`/api/nodes/${id}`, { method: 'DELETE' }),
  addNode: (body: unknown) =>
    apiFetch('/api/nodes', { method: 'POST', body: JSON.stringify(body) }),
  wakeNode: (id: string) =>
    apiFetch(`/api/nodes/${id}/wake`, { method: 'POST' }),
};
