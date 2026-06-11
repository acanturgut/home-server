import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Bot,
  Loader2,
  Menu,
  Plus,
  Square,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { chatApi } from '@/features/chat/api';
import { ChatMarkdown } from '@/features/chat/components/ChatMarkdown';
import {
  DEFAULT_SYSTEM_PROMPT,
  type ChatMsg,
  type ChatSession,
} from '@/features/chat/types';

/**
 * Minimal, mobile-first ChatPanel.
 *
 * Three things only:
 *   1. Model picker (Auto / Fast / Smart) — top-right.
 *   2. Message list — scrolls.
 *   3. Composer — sticky bottom, respects iOS safe-area.
 *
 * Sessions persist to /api/chats (compatible with the legacy schema, so
 * historical chats are preserved). Streaming uses /api/chat/stream where
 * the server emits NDJSON status events and a final `step:"done"` event
 * containing the assistant message. We surface intermediate steps as a
 * subtle "thinking…" line and replace it with the answer when done.
 */

type Route = 'auto' | 'light' | 'heavy';

const ROUTES: Array<{ id: Route; label: string; hint: string }> = [
  { id: 'auto', label: 'Auto', hint: 'Picks best model' },
  { id: 'light', label: 'Fast', hint: 'Local · low latency' },
  { id: 'heavy', label: 'Smart', hint: 'Bigger model · slower' },
];

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

export function ChatPanel() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const persistTimer = useRef<number | null>(null);

  // ── Load on mount ─────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      const remote = await chatApi.loadSessions();
      if (!alive) return;
      const list = (remote && remote.length > 0 ? remote : [newSession()])
        .slice()
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setSessions(list);
      setActiveId(list[0].id);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ── Persist (debounced) ───────────────────────────────────
  useEffect(() => {
    if (sessions.length === 0) return;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      chatApi.saveSessions(sessions).catch(() => {
        /* best-effort; offline persistence not critical */
      });
    }, 600);
    return () => {
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
    };
  }, [sessions]);

  // ── Listen for prefill events from Dashboard ──────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt?: string }>).detail;
      if (!detail?.prompt) return;
      setInput(detail.prompt);
      // focus next paint so the textarea grabs the caret
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener('chat:prefill-prompt', handler);
    return () => window.removeEventListener('chat:prefill-prompt', handler);
  }, []);

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) || null,
    [sessions, activeId],
  );

  // Scroll to bottom whenever messages or thinking change.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [active?.messages, thinking]);

  const updateActive = useCallback(
    (mut: (s: ChatSession) => ChatSession) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === activeId ? mut(s) : s)),
      );
    },
    [activeId],
  );

  const createNew = useCallback(() => {
    const s = newSession();
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
    setDrawerOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const removeSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (next.length === 0) {
          const fresh = newSession();
          setActiveId(fresh.id);
          return [fresh];
        }
        if (id === activeId) setActiveId(next[0].id);
        return next;
      });
    },
    [activeId],
  );

  const setRoute = useCallback(
    (r: Route) => {
      updateActive((s) => ({ ...s, modelOverride: r, updatedAt: Date.now() }));
    },
    [updateActive],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setThinking(null);
  }, []);

  // ── Send ──────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !active || busy) return;

    setInput('');
    const userMsg: ChatMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
    };
    const newMessages: ChatMsg[] = [...active.messages, userMsg];

    // Auto-title from first message.
    const title =
      active.messages.length === 0
        ? text.slice(0, 60).replace(/\s+/g, ' ').trim() || 'New chat'
        : active.title;

    updateActive((s) => ({
      ...s,
      title,
      messages: newMessages,
      updatedAt: Date.now(),
    }));

    setBusy(true);
    setThinking('Thinking…');

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const route = (active.modelOverride as Route) || 'auto';
      const body: Record<string, unknown> = {
        messages: [
          { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
          ...newMessages.map(({ role, content }) => ({ role, content })),
        ],
      };
      if (route !== 'auto') body.route = route;

      const res = await chatApi.streamChat(body, ctrl.signal);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let final: ChatMsg | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.step === 'classifying') setThinking('Routing…');
            else if (ev.step === 'classified')
              setThinking(`Using ${ev.node || 'model'}…`);
            else if (ev.step === 'generating')
              setThinking(`Generating on ${ev.node || 'model'}…`);
            else if (ev.step === 'searching') setThinking('Searching…');
            else if (ev.step === 'done') {
              final = {
                id: `a-${Date.now()}`,
                role: 'assistant',
                content: ev.content || '',
                model: ev.model,
                node: ev.node,
                latency: ev.latency,
                promptTokens: ev.prompt_tokens,
                completionTokens: ev.completion_tokens,
                totalTokens: ev.total_tokens,
              };
            } else if (ev.step === 'error') {
              final = {
                id: `e-${Date.now()}`,
                role: 'assistant',
                content: `⚠️ ${ev.message || 'Request failed'}`,
              };
            }
          } catch {
            /* ignore malformed line */
          }
        }
      }

      if (final) {
        const f = final;
        updateActive((s) => ({
          ...s,
          messages: [...newMessages, f],
          updatedAt: Date.now(),
        }));
      }
    } catch (e) {
      const msg = (e as Error).message || 'Failed';
      if (msg !== 'aborted') {
        updateActive((s) => ({
          ...s,
          messages: [
            ...newMessages,
            {
              id: `e-${Date.now()}`,
              role: 'assistant',
              content: `⚠️ ${msg}`,
            },
          ],
          updatedAt: Date.now(),
        }));
      }
    } finally {
      setBusy(false);
      setThinking(null);
      abortRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [active, busy, input, updateActive]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter newline. Mobile keeps Enter as newline (most
    // soft keyboards lack Shift) — there's a Send button anyway.
    if (e.key === 'Enter' && !e.shiftKey && !isMobile()) {
      e.preventDefault();
      send();
    }
  };

  const route = (active?.modelOverride as Route) || 'auto';

  return (
    <div className="flex h-full bg-background">
      {/* ── Desktop sessions rail (hidden on mobile) ─────────── */}
      <DesktopSessions
        sessions={sessions}
        activeId={activeId}
        onPick={setActiveId}
        onNew={createNew}
        onDelete={removeSession}
      />

      {/* ── Main column ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-border/20 bg-background/80 backdrop-blur">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open chats"
            className="sm:hidden p-1.5 rounded-md hover:bg-white/5 text-muted-foreground hover:text-foreground">
            <Menu size={18} />
          </button>
          <h2 className="text-sm font-medium text-foreground/90 truncate flex-1 min-w-0">
            {active?.title || 'Chat'}
          </h2>
          <RoutePicker value={route} onChange={setRoute} />
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto max-w-3xl px-3 sm:px-6 py-4 space-y-4">
            {!active || active.messages.length === 0 ? (
              <EmptyState onPick={(t) => setInput(t)} />
            ) : (
              active.messages.map((m) => <Bubble key={m.id} msg={m} />)
            )}
            {thinking && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground italic px-1">
                <Loader2 size={12} className="animate-spin" />
                {thinking}
              </div>
            )}
          </div>
        </div>

        {/* Composer (sticky bottom; safe-area aware) */}
        <div className="shrink-0 border-t border-border/20 bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto max-w-3xl px-3 sm:px-6 py-2">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Message…"
                rows={1}
                className="flex-1 resize-none bg-card/40 border border-border/30 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 max-h-40"
                style={{ minHeight: 40 }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
                }}
              />
              <button
                onClick={busy ? stop : send}
                disabled={!busy && !input.trim()}
                aria-label={busy ? 'Stop' : 'Send'}
                className={`shrink-0 h-10 w-10 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 ${
                  busy
                    ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}>
                {busy ? <Square size={16} fill="currentColor" /> : <ArrowUp size={18} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile sessions drawer ───────────────────────────── */}
      {drawerOpen && (
        <MobileSessions
          sessions={sessions}
          activeId={activeId}
          onPick={(id) => {
            setActiveId(id);
            setDrawerOpen(false);
          }}
          onNew={createNew}
          onDelete={removeSession}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function isMobile() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
}

function RoutePicker({
  value,
  onChange,
}: {
  value: Route;
  onChange: (r: Route) => void;
}) {
  return (
    <div className="flex items-center rounded-md border border-border/30 bg-card/30 p-0.5 text-[11px]">
      {ROUTES.map((r) => (
        <button
          key={r.id}
          onClick={() => onChange(r.id)}
          title={r.hint}
          className={`px-2 py-1 rounded transition-colors ${
            value === r.id
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

function Bubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center">
          <Bot size={14} />
        </div>
      )}
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2 text-sm wrap-break-word leading-relaxed ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm whitespace-pre-wrap'
            : 'bg-card/60 text-foreground/95 border border-border/15 rounded-bl-sm'
        }`}>
        {isUser ? msg.content : <ChatMarkdown text={msg.content} />}
        {!isUser && (msg.model || msg.latency) && (
          <div className="mt-1.5 text-[10px] text-muted-foreground/60 flex items-center gap-1.5">
            {msg.model && <span>{msg.model}</span>}
            {msg.latency && (
              <>
                <span>·</span>
                <span>{msg.latency}</span>
              </>
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-muted/50 text-muted-foreground flex items-center justify-center">
          <User size={14} />
        </div>
      )}
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  const suggestions = [
    'Summarize today’s news',
    'Help me draft a quick email',
    'Explain this code I’ll paste',
    'Brainstorm 5 ideas for…',
  ];
  return (
    <div className="text-center py-12 space-y-5">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary">
        <Bot size={22} />
      </div>
      <div>
        <h3 className="text-sm font-medium text-foreground/90">
          What can I help with?
        </h3>
        <p className="text-xs text-muted-foreground/65 mt-1">
          Pick a model above or just start typing.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="text-left text-xs px-3 py-2 rounded-lg border border-border/25 bg-card/30 hover:border-primary/40 hover:bg-primary/5 text-foreground/85 transition-colors">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Sessions (desktop rail + mobile sheet) ──────────────────────

function SessionRow({
  s,
  active,
  onPick,
  onDelete,
}: {
  s: ChatSession;
  active: boolean;
  onPick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors ${
        active ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
      }`}
      onClick={onPick}>
      <span className="text-xs truncate flex-1">{s.title || 'Untitled'}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (window.confirm(`Delete "${s.title || 'chat'}"?`)) onDelete();
        }}
        aria-label="Delete chat"
        className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-rose-300 transition-opacity">
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function DesktopSessions({
  sessions,
  activeId,
  onPick,
  onNew,
  onDelete,
}: {
  sessions: ChatSession[];
  activeId: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="hidden sm:flex w-60 shrink-0 border-r border-border/20 bg-muted/10 flex-col">
      <div className="p-2 border-b border-border/15">
        <button
          onClick={onNew}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-primary/15 text-primary hover:bg-primary/25 transition-colors">
          <Plus size={14} /> New chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {sessions.map((s) => (
          <SessionRow
            key={s.id}
            s={s}
            active={s.id === activeId}
            onPick={() => onPick(s.id)}
            onDelete={() => onDelete(s.id)}
          />
        ))}
      </div>
    </aside>
  );
}

function MobileSessions({
  sessions,
  activeId,
  onPick,
  onNew,
  onDelete,
  onClose,
}: {
  sessions: ChatSession[];
  activeId: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="sm:hidden fixed inset-0 z-50 flex">
      <div className="w-72 max-w-[80vw] bg-background border-r border-border/30 flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/20">
          <h3 className="text-sm font-medium">Chats</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>
        <div className="p-2 border-b border-border/15">
          <button
            onClick={onNew}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-md bg-primary/15 text-primary hover:bg-primary/25">
            <Plus size={16} /> New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {sessions.map((s) => (
            <SessionRow
              key={s.id}
              s={s}
              active={s.id === activeId}
              onPick={() => onPick(s.id)}
              onDelete={() => onDelete(s.id)}
            />
          ))}
        </div>
      </div>
      <button
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-black/60"
      />
    </div>
  );
}
