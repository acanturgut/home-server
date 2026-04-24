import { apiFetch, apiJson, apiJsonSafe } from '@/lib/api';
import type { AppInfo } from '@/lib/types';
import type { ChatSession } from '@/features/chat/types';

interface ChatMessageDTO {
  role: string;
  content: string;
}

/** Chat panel HTTP calls. Streaming endpoints return raw `Response`. */
export const chatApi = {
  // session persistence
  loadSessions: () => apiJsonSafe<ChatSession[]>('/api/chats'),
  saveSessions: (sessions: ChatSession[]) =>
    apiFetch('/api/chats', {
      method: 'PUT',
      body: JSON.stringify(sessions),
    }),

  // single-shot chat (used for auto-title, etc.)
  postChat: (body: { messages: ChatMessageDTO[] }) =>
    apiFetch('/api/chat', { method: 'POST', body: JSON.stringify(body) }),

  // streaming chat (NDJSON)
  streamChat: (body: unknown, signal?: AbortSignal) =>
    apiFetch('/api/chat/stream', {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    }),

  // compare across multiple routes
  compare: (body: unknown) =>
    apiJson<{ runs: unknown }>('/api/chat/compare', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // snippets / URL fetch / RAG / schedules
  saveSnippet: (body: { title: string; body: string; kind?: string }) =>
    apiFetch('/api/snippets', { method: 'POST', body: JSON.stringify(body) }),
  fetchUrl: (url: string) =>
    apiJson<{ title?: string; text: string }>('/api/fetch-url', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  ragSearch: (q: string, k = 5) =>
    apiJson<{
      hits?: Array<{ path: string; app: string; score: number; snippet: string }>;
    }>('/api/rag/search', {
      method: 'POST',
      body: JSON.stringify({ q, k }),
    }),
  createSchedule: (body: { cron: string; prompt: string; enabled: boolean }) =>
    apiJson<{ title: string; cron: string }>('/api/schedules', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // schedules CRUD (used by SchedulesModal)
  listSchedules: <T = unknown>() => apiJsonSafe<T[]>('/api/schedules'),
  upsertSchedule: (body: unknown) =>
    apiFetch('/api/schedules', { method: 'POST', body: JSON.stringify(body) }),
  runSchedule: (id: string) =>
    apiFetch(`/api/schedules/${encodeURIComponent(id)}/run`, {
      method: 'POST',
    }),
  deleteSchedule: (id: string) =>
    apiFetch(`/api/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // web search + page fetch (one-shot helper)
  webSearchFetch: (
    body: { q: string; k: number; perPageChars: number },
    signal?: AbortSignal,
  ) =>
    apiFetch('/api/web/search-fetch', {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    }),

  // mention autocomplete sources
  listApps: () => apiJsonSafe<AppInfo[]>('/api/apps'),
  listNodes: () => apiJsonSafe<unknown[]>('/api/nodes'),
};
