import { apiFetch, apiJson, apiJsonSafe } from '@/lib/api';
import type { AppInfo } from '@/lib/types';

interface AppFileDTO {
  path: string;
  size?: number;
}

/** App-builder HTTP calls. Streaming endpoints return raw `Response`. */
export const appsApi = {
  // listings
  listApps: () => apiJsonSafe<AppInfo[]>('/api/apps'),
  listNodes: () => apiJsonSafe<unknown[]>('/api/nodes'),
  /** Live per-node stats (CPU/Mem/GPU/temp) used during builds. */
  nodeStats: () => apiJsonSafe<Record<string, unknown>>('/api/nodes/stats'),

  // git
  getCommits: (app: string, limit = 50) =>
    apiJsonSafe<{ commits?: unknown[] }>(
      `/api/apps/${app}/git/log?limit=${limit}`,
    ),
  getDiff: (app: string, sha: string) =>
    apiJsonSafe<{ diff?: string }>(`/api/apps/${app}/git/diff/${sha}`),
  commit: (app: string, message: string) =>
    apiJson<{ sha?: string }>(`/api/apps/${app}/git/commit`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  revertCommit: (app: string, sha: string) =>
    apiJson<{ error?: string }>(`/api/apps/${app}/git/revert/${sha}`, {
      method: 'POST',
    }),

  // files
  listFiles: (app: string) =>
    apiJsonSafe<AppFileDTO[]>(`/api/apps/${app}/files`),
  getFile: (app: string, path: string) =>
    apiJsonSafe<{ content?: string }>(`/api/apps/${app}/files/${path}`),
  saveFile: (app: string, path: string, content: string) =>
    apiFetch(`/api/apps/${app}/files/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  // logs / stats / search
  getLogs: (app: string, tail = 200) =>
    apiJsonSafe<{ logs?: string }>(`/api/apps/${app}/logs?tail=${tail}`),
  getStats: (app: string) =>
    apiJsonSafe<unknown>(`/api/apps/${app}/stats`),
  search: (app: string, q: string) =>
    apiJsonSafe<unknown[]>(
      `/api/apps/${app}/search?q=${encodeURIComponent(q)}`,
    ),

  // terminal exec
  exec: (app: string, command: string) =>
    apiJson<{ output?: string; error?: string; status?: string }>(
      `/api/apps/${app}/exec`,
      { method: 'POST', body: JSON.stringify({ command }) },
    ),

  // app settings
  putAppSettings: (app: string, body: { icon?: string; route?: string }) =>
    apiFetch(`/api/apps/${app}/settings`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  // build / clarify
  clarify: (prompt: string) =>
    apiJson<{
      summary?: string;
      suggestedName?: string;
      questions?: unknown[];
    }>('/api/apps/clarify', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
  /** Streaming NDJSON: caller reads the body. */
  streamPost: (path: string, body: unknown, signal?: AbortSignal) =>
    apiFetch(path, {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    }),
  cancelBuild: (app: string) =>
    apiFetch(`/api/apps/${app}/cancel`, { method: 'POST' }),

  // lifecycle
  deleteApp: (name: string) =>
    apiFetch(`/api/apps/${name}`, { method: 'DELETE' }),
  stopApp: (name: string) =>
    apiFetch(`/api/apps/${name}/stop`, { method: 'POST' }),
  restartApp: (name: string) =>
    apiFetch(`/api/apps/${name}/restart`, { method: 'POST' }),
  deployApp: (name: string) =>
    apiFetch(`/api/apps/${name}/deploy`, { method: 'POST' }),
  stopDev: (app: string) =>
    apiFetch(`/api/apps/${app}/dev/stop`, { method: 'POST' }),

  // chat assistant per-app
  chatWithApp: (
    app: string,
    body: { messages: unknown[]; currentFile: string },
  ) =>
    apiJson<{ response?: string; content?: string; message?: string }>(
      `/api/apps/${app}/chat`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
};
