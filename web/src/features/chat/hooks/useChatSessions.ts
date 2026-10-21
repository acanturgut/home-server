import { useCallback, useEffect, useState } from 'react';
import { chatApi } from '@/features/chat/api';
import type { ChatSession } from '@/features/chat/types';

function newSession(): ChatSession {
  const now = Date.now();
  return {
    id: `s-${now}`,
    title: 'New chat',
    messages: [],
    updatedAt: now,
    createdAt: now,
    modelOverride: 'auto',
  };
}

/**
 * Saved chat sessions: loaded once from /api/chats, newest first, and
 * written back (debounced, best effort) after every change.
 */
export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void chatApi.loadSessions().then((remote) => {
      if (!alive) return;
      const list = remote?.length
        ? [...remote].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        : [newSession()];
      setSessions(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (sessions.length === 0) return;
    const t = setTimeout(() => {
      chatApi.saveSessions(sessions).catch(() => {
        /* best effort: the next change saves again */
      });
    }, 600);
    return () => clearTimeout(t);
  }, [sessions]);

  /** Applies `mut` to session `id` (by id, so a reply lands in its own chat). */
  const update = useCallback(
    (id: string, mut: (s: ChatSession) => ChatSession) =>
      setSessions((prev) => prev.map((s) => (s.id === id ? mut(s) : s))),
    [],
  );

  const create = () => {
    const s = newSession();
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
  };

  // Removing the active chat falls back to the newest one (see `active`).
  const remove = (id: string) =>
    setSessions((prev) => {
      const rest = prev.filter((s) => s.id !== id);
      return rest.length ? rest : [newSession()];
    });

  const active = sessions.find((s) => s.id === activeId) ?? sessions[0] ?? null;

  return {
    sessions,
    active,
    select: setActiveId,
    create,
    remove,
    update,
  };
}
