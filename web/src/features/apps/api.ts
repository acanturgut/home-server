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
  getStats: (app: string) => apiJsonSafe<unknown>(`/api/apps/${app}/stats`),
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
      raw?: string;
      parse_err?: string;
    }>('/api/apps/clarify', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
  /** Rewrite a raw idea into a clearer app brief. */
  refinePrompt: (prompt: string) =>
    apiJson<{
      refined?: string;
      summary?: string;
      raw?: string;
      parse_err?: string;
    }>('/api/apps/refine', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
  /** Break the brief into 3–6 ordered build chunks. */
  planApp: (prompt: string) =>
    apiJson<{
      summary?: string;
      chunks?: Array<{
        title: string;
        description: string;
        files?: string[];
      }>;
      raw?: string;
      parse_err?: string;
    }>('/api/apps/plan', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
  /** High-level architecture sketch (stack, models, endpoints, components). */
  architectApp: (prompt: string) =>
    apiJson<{
      summary?: string;
      stack?: string;
      models?: Array<{ name: string; fields: string }>;
      endpoints?: Array<{ method: string; path: string; purpose: string }>;
      components?: Array<{ name: string; purpose: string }>;
      notes?: string;
      raw?: string;
      parse_err?: string;
    }>('/api/apps/architect', {
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
  /** Server-side buffered build/rebuild/fix events for re-attaching after
   * a tab switch / page refresh. `active` mirrors `pipeline.IsActive`. */
  getEvents: (app: string) =>
    apiJsonSafe<{
      active?: boolean;
      events?: Array<{
        step: string;
        message: string;
        detail?: string;
        latency?: string;
        timestamp?: string;
      }>;
    }>(`/api/apps/${app}/events`),

  // lifecycle
  deleteApp: (name: string) =>
    apiFetch(`/api/apps/${name}`, { method: 'DELETE' }),
  stopApp: (name: string) =>
    apiFetch(`/api/apps/${name}/stop`, { method: 'POST' }),
  restartApp: (name: string) =>
    apiFetch(`/api/apps/${name}/restart`, { method: 'POST' }),
  deployApp: (name: string) =>
    apiFetch(`/api/apps/${name}/deploy`, { method: 'POST' }),
  /** Trigger an LLM-driven auto-fix; description is optional. Streaming. */
  fixApp: (name: string, description = '') =>
    apiFetch(`/api/apps/${name}/fix`, {
      method: 'POST',
      body: JSON.stringify({ description }),
    }),
  /** Apply a feature/change request via the LLM rebuild path. Streaming. */
  rebuildApp: (name: string, changes: string) =>
    apiFetch(`/api/apps/${name}/rebuild`, {
      method: 'POST',
      body: JSON.stringify({ changes }),
    }),

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
