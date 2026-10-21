import { apiFetch, apiJsonSafe } from '@/lib/api';
import type { ChatSession } from '@/features/chat/types';

/** Chat panel HTTP calls. Streaming endpoints return raw `Response`. */
export const chatApi = {
  // session persistence
  loadSessions: () => apiJsonSafe<ChatSession[]>('/api/chats'),
  saveSessions: (sessions: ChatSession[]) =>
    apiFetch('/api/chats', {
      method: 'PUT',
      body: JSON.stringify(sessions),
    }),

  // streaming chat (NDJSON)
  streamChat: (body: unknown, signal?: AbortSignal) =>
    apiFetch('/api/chat/stream', {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    }),
};
