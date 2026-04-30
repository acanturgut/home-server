import { apiFetch, apiJson, apiJsonSafe } from '@/lib/api';
import type { NodeConfig } from '@/features/settings/components/NodeFormInline';

export interface SystemConfigDTO {
  router_model: string;
  ollama_host: string;
  version: string;
  started_at: string;
  uptime_seconds: number;
  data_dir: string;
  log_dir: string;
  port: string;
  anthropic_set: boolean;
  homekit_pin: string;
  apps_count: number;
  nodes_count: number;
}

export interface HealthDTO {
  backends?: {
    ollama?: boolean;
    nodes?: NodeConfig[];
  };
}

/** Settings page HTTP calls. */
export const settingsApi = {
  // prompts
  getPrompts: () => apiJsonSafe<Record<string, string>>('/api/prompts'),
  putPrompts: (prompts: Record<string, string>) =>
    apiJson<Record<string, string>>('/api/prompts', {
      method: 'PUT',
      body: JSON.stringify(prompts),
    }),
  resetPrompts: () =>
    apiJson<Record<string, string>>('/api/prompts/reset', { method: 'POST' }),

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
  getNodeModelsStatus: (id: string) =>
    apiJsonSafe<{
      models?: { id: string; state: string; type?: string; loaded: boolean }[];
    }>(`/api/nodes/${id}/models/status`),
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
  shutdownNode: (id: string) =>
    apiFetch(`/api/nodes/${id}/shutdown`, { method: 'POST' }),
};
