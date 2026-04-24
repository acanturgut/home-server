import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Archive, Blocks, ChevronDown, ChevronRight, Clock, Copy, Cpu, Download, GitBranch, Globe, Mic, Pencil, Pin, Plus, RefreshCw, Search, Send, Square, Star, Trash2, Volume2, X } from 'lucide-react';
import { API_BASE } from '@/lib/api';
import { copyToClipboard, gotoPage, relTime } from '@/lib/format';
import { speak, stopSpeaking, useSpeechRecognition } from '@/lib/voice';
import { SLASH_COMMANDS } from '@/lib/slash';
import { CompareBlock, MarkdownView } from '@/lib/markdown';
import { BUILTIN_PERSONAS, DEFAULT_SYSTEM_PROMPT, type ChatAttachment, type ChatMsg, type ChatSession, type Persona } from '@/lib/chat';
import type { AppInfo } from '@/lib/types';
import { SearchPalette } from '@/components/SearchPalette';
import { SchedulesModal } from '@/components/SchedulesModal';
import { PersonaQuickAdd } from '@/components/PersonaQuickAdd';
import type { NodeConfig } from '@/components/settings/NodeFormInline';

export function ChatPanel() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem('chat-sessions');
      const arr = saved ? JSON.parse(saved) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  });
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('chat-active') || null;
    } catch {
      return null;
    }
  });
  const [personas, setPersonas] = useState<Persona[]>(() => {
    try {
      const saved = localStorage.getItem('chat-personas');
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.length) return arr;
      }
    } catch {
      // ignore
    }
    return BUILTIN_PERSONAS;
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [liveSteps, setLiveSteps] = useState<ChatMsg[]>([]);
  const [sideOpen, setSideOpen] = useState(true);
  const [systemEditOpen, setSystemEditOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [schedulesOpen, setSchedulesOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [showSlash, setShowSlash] = useState(false);
  const [showFilter, setShowFilter] = useState<'all' | 'pinned' | 'archived'>(
    'all',
  );
  const [resumeBanner, setResumeBanner] = useState(false);
  const [collapsedReasoning, setCollapsedReasoning] = useState<
    Record<string, boolean>
  >({});
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [pendingModel, setPendingModel] = useState<string>(''); // one-shot override
  const [toolsEnabled, setToolsEnabled] = useState<boolean>(false); // one-shot tool-call hint
  const [webEnabled, setWebEnabled] = useState<boolean>(false); // one-shot web search hint
  const [compareRoutes, setCompareRoutes] = useState<string[] | null>(null); // one-shot compare mode
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);

  const active = sessions.find((s) => s.id === activeId);
  const displayMessages = useMemo(
    () => [...(active?.messages || []), ...liveSteps],
    [active, liveSteps],
  );

  // Persist helpers (debounced to server, immediate to localStorage as fallback)
  const saveTimer = useRef<number | null>(null);
  const persist = useCallback((updated: ChatSession[]) => {
    setSessions(updated);
    try {
      localStorage.setItem('chat-sessions', JSON.stringify(updated));
    } catch {
      // ignore (quota)
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      fetch(`${API_BASE}/api/chats`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }).catch(() => {});
    }, 600);
  }, []);
  // Initial server load (overrides localStorage if present and non-empty)
  useEffect(() => {
    fetch(`${API_BASE}/api/chats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((arr) => {
        if (Array.isArray(arr) && arr.length > 0) {
          setSessions(arr);
          try {
            localStorage.setItem('chat-sessions', JSON.stringify(arr));
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const persistPersonas = useCallback((arr: Persona[]) => {
    setPersonas(arr);
    try {
      localStorage.setItem('chat-personas', JSON.stringify(arr));
    } catch {
      // ignore
    }
  }, []);

  const updateActive = useCallback(
    (mut: (s: ChatSession) => ChatSession) => {
      if (!activeId) return;
      const updated = sessions.map((s) => (s.id === activeId ? mut(s) : s));
      persist(updated);
    },
    [activeId, sessions, persist],
  );

  const newSession = useCallback(
    (opts?: Partial<ChatSession>) => {
      const s: ChatSession = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        title: 'New Chat',
        messages: [],
        updatedAt: Date.now(),
        createdAt: Date.now(),
        ...opts,
      };
      const updated = [s, ...sessions];
      persist(updated);
      setActiveId(s.id);
      try {
        localStorage.setItem('chat-active', s.id);
      } catch {
        /* ignore */
      }
      setTimeout(() => inputRef.current?.focus(), 50);
      return s.id;
    },
    [sessions, persist],
  );

  const deleteSession = useCallback(
    (id: string) => {
      const remaining = sessions.filter((s) => s.id !== id);
      persist(remaining);
      if (activeId === id) {
        const next = remaining[0]?.id || null;
        setActiveId(next);
        if (next) {
          try {
            localStorage.setItem('chat-active', next);
          } catch {
            /* ignore */
          }
        }
      }
    },
    [sessions, activeId, persist],
  );

  // Auto-create first session on mount
  useEffect(() => {
    if (sessions.length === 0) newSession();
    // detect "in flight" state from previous load
    if (localStorage.getItem('chat-loading') === '1') {
      setResumeBanner(true);
      try {
        localStorage.removeItem('chat-loading');
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to bottom on new content
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [displayMessages.length, liveSteps.length]);

  // ── Auto-title via /api/chat (light model, non-blocking) ──
  const autoTitle = useCallback(
    async (sessionId: string, firstUser: string, firstAssistant: string) => {
      try {
        const r = await fetch(`${API_BASE}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content:
                  'You write extremely short chat titles. Reply with 2-5 words, no quotes, no punctuation.',
              },
              {
                role: 'user',
                content: `User: ${firstUser}\n\nAssistant: ${firstAssistant.slice(0, 600)}\n\nTitle:`,
              },
            ],
          }),
        });
        if (!r.ok) return;
        const data = await r.json();
        let t = (data?.message?.content || data?.content || '').trim();
        t = t.replace(/^"|"$/g, '').replace(/[.!?]+$/, '');
        if (t && t.length <= 60) {
          setSessions((prev) => {
            const next = prev.map((s) =>
              s.id === sessionId && s.title.startsWith(firstUser.slice(0, 10))
                ? { ...s, title: t }
                : s,
            );
            try {
              localStorage.setItem('chat-sessions', JSON.stringify(next));
            } catch {
              /* ignore */
            }
            return next;
          });
        }
      } catch {
        // ignore
      }
    },
    [],
  );

  // ── Slash commands ──
  const runSlash = useCallback(
    (raw: string): boolean => {
      const line = raw.trim();
      if (!line.startsWith('/')) return false;
      const [cmd, ...rest] = line.split(/\s+/);
      const arg = rest.join(' ');
      switch (cmd) {
        case '/clear':
          updateActive((s) => ({ ...s, messages: [], updatedAt: Date.now() }));
          setInput('');
          return true;
        case '/new':
          newSession();
          setInput('');
          return true;
        case '/system':
          updateActive((s) => ({ ...s, system: arg, updatedAt: Date.now() }));
          setStatusMsg('System prompt updated');
          setInput('');
          return true;
        case '/model':
          if (!arg) {
            setStatusMsg('Usage: /model auto|light|heavy|<node-name>');
          } else {
            updateActive((s) => ({
              ...s,
              modelOverride: arg,
              updatedAt: Date.now(),
            }));
            setStatusMsg(`Routing override → ${arg}`);
          }
          setInput('');
          return true;
        case '/temp': {
          const t = parseFloat(arg);
          if (!isFinite(t) || t < 0 || t > 2) {
            setStatusMsg('Usage: /temp 0.0–2.0');
          } else {
            updateActive((s) => ({
              ...s,
              temperature: t,
              updatedAt: Date.now(),
            }));
            setStatusMsg(`Temperature → ${t}`);
          }
          setInput('');
          return true;
        }
        case '/persona': {
          const p = personas.find((x) => x.id === arg);
          if (!p) {
            setStatusMsg(
              `Unknown persona "${arg}". Try: ${personas.map((x) => x.id).join(', ')}`,
            );
          } else {
            updateActive((s) => ({
              ...s,
              system: p.system,
              updatedAt: Date.now(),
            }));
            setStatusMsg(`Persona → ${p.name}`);
          }
          setInput('');
          return true;
        }
        case '/title':
          if (arg)
            updateActive((s) => ({ ...s, title: arg, updatedAt: Date.now() }));
          setInput('');
          return true;
        case '/build': {
          const lastA = [...(active?.messages || [])]
            .reverse()
            .find((m) => m.role === 'assistant');
          if (!lastA) {
            setStatusMsg('No assistant reply to send.');
          } else {
            gotoPage('apps', { prompt: lastA.content });
            setStatusMsg('Sent to Apps wizard.');
          }
          setInput('');
          return true;
        }
        case '/save': {
          const lastA = [...(active?.messages || [])]
            .reverse()
            .find((m) => m.role === 'assistant');
          if (!lastA) {
            setStatusMsg('No assistant reply to save.');
          } else {
            saveSnippet({
              title: arg || active?.title || 'Snippet',
              body: lastA.content,
              kind: 'reply',
            });
          }
          setInput('');
          return true;
        }
        case '/web': {
          if (!arg) {
            setStatusMsg('Usage: /web https://example.com');
          } else {
            fetchAndAttach(arg);
          }
          setInput('');
          return true;
        }
        case '/rag': {
          if (!arg) {
            setStatusMsg('Usage: /rag <query>');
          } else {
            ragSearchAndAttach(arg);
          }
          setInput('');
          return true;
        }
        case '/tools': {
          const on = arg !== 'off';
          setToolsEnabled(on);
          setStatusMsg(
            on
              ? 'Tool calling enabled for next reply.'
              : 'Tool calling disabled.',
          );
          setInput('');
          return true;
        }
        case '/compare': {
          const routes = (arg || 'light,heavy').split(/[,\s]+/).filter(Boolean);
          if (routes.length < 2) {
            setStatusMsg(
              'Usage: /compare light,heavy  (or: /compare light,heavy,<node-name>)',
            );
            setInput('');
            return true;
          }
          setCompareRoutes(routes);
          setStatusMsg(
            `Compare mode: next message will fan out to [${routes.join(', ')}].`,
          );
          setInput('');
          return true;
        }
        case '/schedule': {
          if (!arg) {
            setStatusMsg(
              'Usage: /schedule <cron> <prompt>  e.g. /schedule @every 1h What is new?',
            );
            setInput('');
            return true;
          }
          // Split first token as cron if it starts with @ OR is 5 fields; fall back to @every 1h
          let cron = '@every 1h';
          let prompt = arg;
          if (arg.startsWith('@every ')) {
            const space = arg.indexOf(' ', 7);
            if (space > 0) {
              cron = arg.slice(0, space);
              prompt = arg.slice(space + 1).trim();
            }
          } else {
            const parts = arg.split(/\s+/);
            if (parts.length >= 6) {
              cron = parts.slice(0, 5).join(' ');
              prompt = parts.slice(5).join(' ');
            }
          }
          createSchedule(cron, prompt);
          setInput('');
          return true;
        }
        case '/export':
          exportSession();
          setInput('');
          return true;
        case '/help':
          setStatusMsg(
            SLASH_COMMANDS.map((c) => `${c.cmd} — ${c.hint}`).join('\n'),
          );
          setInput('');
          return true;
        default:
          setStatusMsg(`Unknown command "${cmd}". Type / to see options.`);
          setInput('');
          return true;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, personas, updateActive, newSession],
  );

  // ── Stop ──
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setLiveSteps([]);
    try {
      localStorage.removeItem('chat-loading');
    } catch {
      /* ignore */
    }
  }, []);

  // ── Export current session as Markdown ──
  function exportSession() {
    if (!active) return;
    const lines: string[] = [`# ${active.title}`, ''];
    if (active.system) lines.push(`> **System:** ${active.system}`, '');
    for (const m of active.messages) {
      if (m.role === 'system') continue;
      lines.push(
        m.role === 'user'
          ? '### You'
          : `### Assistant${m.node ? ` (${m.node})` : ''}`,
      );
      lines.push('');
      lines.push(m.content);
      lines.push('');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active.title.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'chat'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Save snippet (POST /api/snippets) ──
  async function saveSnippet({
    title,
    body,
    kind,
  }: {
    title: string;
    body: string;
    kind?: string;
  }) {
    try {
      const r = await fetch(`${API_BASE}/api/snippets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, kind: kind || 'reply' }),
      });
      if (!r.ok) throw new Error('save failed');
      setStatusMsg('Snippet saved.');
    } catch (e) {
      setStatusMsg(
        `Save failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
    }
  }

  // ── Fetch a URL via backend and add as attachment ──
  async function fetchAndAttach(rawUrl: string) {
    setStatusMsg(`Fetching ${rawUrl}…`);
    try {
      const r = await fetch(`${API_BASE}/api/fetch-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: rawUrl }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'fetch failed');
      const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
      setAttachments((prev) => [
        ...prev,
        {
          id,
          name: data.title ? `${data.title} (${rawUrl})` : rawUrl,
          type: 'text/url',
          size: (data.text as string).length,
          text: `URL: ${rawUrl}\nTitle: ${data.title || ''}\n\n${data.text}`,
        },
      ]);
      setStatusMsg(`Attached ${data.text.length} chars from ${rawUrl}`);
    } catch (e) {
      setStatusMsg(
        `Fetch failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
    }
  }

  // ── RAG: search indexed app source and attach hits as one "codebase" attachment ──
  async function ragSearchAndAttach(q: string) {
    setStatusMsg(`Searching codebase for "${q}"…`);
    try {
      const r = await fetch(`${API_BASE}/api/rag/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, k: 5 }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'search failed');
      const hits: Array<{
        path: string;
        app: string;
        score: number;
        snippet: string;
      }> = data.hits || [];
      if (hits.length === 0) {
        setStatusMsg(`No matches for "${q}".`);
        return;
      }
      const text = hits
        .map(
          (h) =>
            `--- ${h.path} (score=${h.score.toFixed(2)}) ---\n${h.snippet}`,
        )
        .join('\n\n');
      const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
      setAttachments((prev) => [
        ...prev,
        {
          id,
          name: `codebase: "${q}" (${hits.length} hits)`,
          type: 'text/rag',
          size: text.length,
          text: `Codebase search query: ${q}\n\n${text}`,
        },
      ]);
      setStatusMsg(
        `Attached ${hits.length} codebase snippet${hits.length === 1 ? '' : 's'}.`,
      );
    } catch (e) {
      setStatusMsg(`RAG failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  // ── Create a scheduled prompt ──
  async function createSchedule(cron: string, prompt: string) {
    if (!prompt.trim()) {
      setStatusMsg('Prompt required.');
      return;
    }
    try {
      const r = await fetch(`${API_BASE}/api/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cron, prompt, enabled: true }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'failed');
      setStatusMsg(`Scheduled "${data.title}" — cron: ${data.cron}`);
    } catch (e) {
      setStatusMsg(
        `Schedule failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
    }
  }

  // ── Fan-out send to multiple routes (compare mode) ──
  async function sendCompare(userText: string, routes: string[]) {
    if (!active) return;
    const uid = Date.now().toString() + Math.random().toString(36).slice(2, 6);
    const pid =
      (Date.now() + 1).toString() + Math.random().toString(36).slice(2, 6);
    const userMsg: ChatMsg = { id: uid, role: 'user', content: userText };
    const placeholder: ChatMsg = {
      id: pid,
      role: 'assistant',
      content: `__COMPARE__\n${JSON.stringify({ routes, pending: true })}`,
      node: 'compare',
    };
    const nextMsgs = [...active.messages, userMsg, placeholder];
    const sid = active.id;
    persist(
      sessions.map((s) =>
        s.id === sid ? { ...s, messages: nextMsgs, updatedAt: Date.now() } : s,
      ),
    );
    setLoading(true);
    try {
      const sysMsg = active.system?.trim()
        ? [{ role: 'system' as const, content: active.system.trim() }]
        : [{ role: 'system' as const, content: DEFAULT_SYSTEM_PROMPT }];
      const apiMsgs = [
        ...sysMsg,
        ...nextMsgs
          .filter((m) => m.role !== 'system' && m.id !== placeholder.id)
          .map(({ role, content }) => ({ role, content })),
      ];
      const r = await fetch(`${API_BASE}/api/chat/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMsgs,
          routes,
          temperature: active.temperature,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'compare failed');
      persist(
        sessions.map((s) => {
          if (s.id !== sid) return s;
          return {
            ...s,
            updatedAt: Date.now(),
            messages: [
              ...s.messages.filter(
                (m) => m.id !== placeholder.id && m.id !== userMsg.id,
              ),
              userMsg,
              {
                id: placeholder.id,
                role: 'assistant' as const,
                content: `__COMPARE__\n${JSON.stringify({ runs: data.runs })}`,
                node: 'compare',
              },
            ],
          };
        }),
      );
    } catch (e) {
      setStatusMsg(
        `Compare failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
      persist(
        sessions.map((s) =>
          s.id === sid
            ? {
                ...s,
                messages: s.messages.filter((m) => m.id !== placeholder.id),
              }
            : s,
        ),
      );
    } finally {
      setLoading(false);
      setCompareRoutes(null);
    }
  }

  // ── Send (used by initial send, regenerate, and resend-from-edit) ──
  const sendWithMessages = useCallback(
    async (
      newMessages: ChatMsg[],
      opts?: { titleSeed?: string; modelOverride?: string },
    ) => {
      if (!active) return;
      const sid = active.id;
      // Optimistic update
      const optimistic = sessions.map((s) =>
        s.id === sid
          ? {
              ...s,
              messages: newMessages,
              updatedAt: Date.now(),
              title:
                s.messages.length === 0 && opts?.titleSeed
                  ? opts.titleSeed.slice(0, 40)
                  : s.title,
            }
          : s,
      );
      persist(optimistic);
      setLoading(true);
      setLiveSteps([]);
      try {
        localStorage.setItem('chat-loading', '1');
      } catch {
        /* ignore */
      }

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const reasoning: Array<{ kind: string; text: string }> = [];

      try {
        const sysMsg = active.system?.trim()
          ? [{ role: 'system' as const, content: active.system.trim() }]
          : [{ role: 'system' as const, content: DEFAULT_SYSTEM_PROMPT }];
        const toolSys = toolsEnabled
          ? [
              {
                role: 'system' as const,
                content:
                  'You may call tools by emitting a fenced code block with language `tool` ' +
                  'containing a JSON object: {"name":"<tool>","args":{...}}. ' +
                  'Available tools: ragSearch(q,k), listApps(), appStatus(name), appLogs(name,tail), httpGet(url). ' +
                  'After the user runs the tool, its JSON result will appear in the next user message; use it to answer. ' +
                  'Emit at most one tool call per turn.',
              },
            ]
          : [];
        const apiMsgs = [
          ...sysMsg,
          ...toolSys,
          ...newMessages
            .filter((m) => m.role !== 'system')
            .map(({ role, content }) => ({ role, content })),
        ];
        const body: Record<string, unknown> = { messages: apiMsgs };
        const override = opts?.modelOverride || active.modelOverride;
        if (override && override !== 'auto') body.route = override;
        if (active.temperature != null) body.temperature = active.temperature;

        const res = await fetch(`${API_BASE}/api/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error('Stream failed');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalMsg: ChatMsg | null = null;

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
              const ts = Date.now();
              if (ev.step === 'classifying') {
                reasoning.push({
                  kind: 'classifying',
                  text: 'Classifying with the router model…',
                });
                setLiveSteps((p) => [
                  ...p.filter((b) => b.stepType !== 'classifying'),
                  {
                    id: `s-${ts}`,
                    role: 'system',
                    content: 'Classifying…',
                    stepType: 'classifying',
                  },
                ]);
              } else if (ev.step === 'classified') {
                reasoning.push({
                  kind: 'classified',
                  text: `Routed → ${ev.node || ''} · ${ev.tier || ''}${ev.classifier_latency ? ` · ${ev.classifier_latency}` : ''}`,
                });
                setLiveSteps((p) => [
                  ...p.filter((b) => b.stepType !== 'classifying'),
                  {
                    id: `s-${ts}`,
                    role: 'system',
                    content: `Routed → ${ev.node} · ${ev.tier}${ev.classifier_latency ? ` · ${ev.classifier_latency}` : ''}`,
                    stepType: 'classified',
                    node: ev.node,
                    tier: ev.tier,
                  },
                ]);
              } else if (ev.step === 'generating') {
                reasoning.push({
                  kind: 'generating',
                  text: `Generating on ${ev.node}…`,
                });
                setLiveSteps((p) => [
                  ...p,
                  {
                    id: `s-${ts}`,
                    role: 'system',
                    content: `Generating on ${ev.node}…`,
                    stepType: 'generating',
                    node: ev.node,
                  },
                ]);
              } else if (ev.step === 'searching') {
                reasoning.push({
                  kind: 'searching',
                  text: 'Searching the web…',
                });
                setLiveSteps((p) => [
                  ...p,
                  {
                    id: `s-${ts}`,
                    role: 'system',
                    content: 'Searching the web…',
                    stepType: 'searching',
                  },
                ]);
              } else if (ev.step === 'search_done') {
                reasoning.push({
                  kind: 'search_done',
                  text: ev.message || 'Search complete',
                });
                setLiveSteps((p) => [
                  ...p.filter((b) => b.stepType !== 'searching'),
                  {
                    id: `s-${ts}`,
                    role: 'system',
                    content: `🔍 ${ev.message || 'Search complete'}`,
                    stepType: 'search_done',
                  },
                ]);
              } else if (ev.step === 'done') {
                finalMsg = {
                  id: (ts + 1).toString(),
                  role: 'assistant',
                  content: ev.content || '',
                  node: ev.node,
                  tier: ev.tier,
                  model: ev.model,
                  route: ev.route,
                  latency: ev.latency,
                  classifierLatency: ev.classifier_latency,
                  promptTokens: ev.prompt_tokens,
                  completionTokens: ev.completion_tokens,
                  totalTokens: ev.total_tokens,
                  reasoningSteps: reasoning.slice(),
                };
              } else if (ev.step === 'error') {
                finalMsg = {
                  id: (ts + 1).toString(),
                  role: 'assistant',
                  content: ev.message || 'Request failed',
                  stepType: 'error',
                  reasoningSteps: reasoning.slice(),
                };
              }
            } catch {
              // ignore parse errors
            }
          }
        }

        setLiveSteps([]);
        const all = finalMsg ? [...newMessages, finalMsg] : newMessages;
        // Recompute totals
        const totals = all.reduce(
          (acc, m) => ({
            p: acc.p + (m.promptTokens || 0),
            c: acc.c + (m.completionTokens || 0),
          }),
          { p: 0, c: 0 },
        );
        const latest = sessions.map((s) =>
          s.id === sid
            ? {
                ...s,
                messages: all,
                updatedAt: Date.now(),
                totalPromptTokens: totals.p,
                totalCompletionTokens: totals.c,
              }
            : s,
        );
        persist(latest);

        // Auto-title once we have a real exchange and the title is still placeholder
        if (
          finalMsg &&
          all.filter((m) => m.role === 'user').length === 1 &&
          (active.title === 'New Chat' || !active.title)
        ) {
          const firstUser = all.find((m) => m.role === 'user')?.content || '';
          autoTitle(sid, firstUser, finalMsg.content);
        }
      } catch (e) {
        if ((e as any)?.name === 'AbortError') {
          // user-initiated stop; persist any user messages already added
          const latest = sessions.map((s) =>
            s.id === sid
              ? { ...s, messages: newMessages, updatedAt: Date.now() }
              : s,
          );
          persist(latest);
        } else {
          setLiveSteps([]);
          const errMsg: ChatMsg = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `Error: ${e instanceof Error ? e.message : 'Failed'}`,
            stepType: 'error',
          };
          persist(
            sessions.map((s) =>
              s.id === sid ? { ...s, messages: [...newMessages, errMsg] } : s,
            ),
          );
        }
      } finally {
        abortRef.current = null;
        setLoading(false);
        try {
          localStorage.removeItem('chat-loading');
        } catch {
          /* ignore */
        }
      }
    },
    [active, sessions, persist, autoTitle, toolsEnabled],
  );

  // ── Composer send ──
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (!active) {
      // No active session — create one and ask the user to press Send again
      // (closure captures the old `active`; next render will have it set).
      newSession();
      setStatusMsg('Started a new chat — press Send again');
      setTimeout(() => setStatusMsg(null), 3000);
      return;
    }
    if (text.startsWith('/')) {
      if (runSlash(text)) return;
    }
    // Compare mode: fan out to multiple routes instead of normal send
    if (compareRoutes && compareRoutes.length >= 2) {
      setInput('');
      await sendCompare(text, compareRoutes);
      return;
    }
    // Clear the input immediately so the user gets visible feedback that
    // the send actually fired, even if the web-search step takes a moment.
    setInput('');
    // Web search: run it first and fold the results into attachments so the
    // model sees them in context. One-shot: toggles off after sending.
    let effectiveAttachments = attachments;
    if (webEnabled) {
      setStatusMsg('🌐 Searching the web…');
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000); // hard cap 15s
      try {
        const r = await fetch(`${API_BASE}/api/web/search-fetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: text, k: 3, perPageChars: 3500 }),
          signal: ctrl.signal,
        });
        if (r.ok) {
          const data = await r.json();
          const results: Array<{
            title?: string;
            url?: string;
            snippet?: string;
            text?: string;
          }> = Array.isArray(data.results) ? data.results : [];
          if (results.length) {
            const combined = results
              .map(
                (rr, i) =>
                  `### Source ${i + 1}: ${rr.title || '(untitled)'}\nURL: ${rr.url || ''}\n${rr.snippet || ''}\n\n${rr.text || '(no page text extracted)'}`,
              )
              .join('\n\n---\n\n');
            const webAtt: ChatAttachment = {
              id: 'web-' + Date.now(),
              name: `Web search: "${text.slice(0, 60)}" (${results.length} sources)`,
              type: 'text/web',
              size: combined.length,
              text: `Web search results for: ${text}\n\n${combined}`,
            };
            effectiveAttachments = [...effectiveAttachments, webAtt];
            setStatusMsg(
              `🌐 Found ${results.length} source${results.length === 1 ? '' : 's'}`,
            );
          } else {
            setStatusMsg('🌐 No results found');
          }
        } else {
          setStatusMsg('🌐 Web search failed');
        }
      } catch {
        setStatusMsg('🌐 Web search timed out — sending without sources');
      } finally {
        clearTimeout(timer);
      }
      setWebEnabled(false);
      setTimeout(() => setStatusMsg(null), 2500);
    }
    const userMsg: ChatMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      attachments: effectiveAttachments.length
        ? effectiveAttachments
        : undefined,
    };
    let composed = text;
    if (effectiveAttachments.length) {
      const parts = effectiveAttachments
        .filter((a) => a.text)
        .map(
          (a) =>
            `\n\n--- Attached: ${a.name} (${a.type}) ---\n${a.text}\n--- end ---`,
        )
        .join('');
      if (parts) composed = `${text}${parts}`;
    }
    const newMessages = [...active.messages, { ...userMsg, content: composed }];
    const titleSeed = active.messages.length === 0 ? text : undefined;
    setAttachments([]);
    const oneShot = pendingModel;
    setPendingModel('');
    await sendWithMessages(newMessages, {
      titleSeed,
      modelOverride: oneShot || undefined,
    });
  }, [
    input,
    loading,
    active,
    attachments,
    pendingModel,
    runSlash,
    sendWithMessages,
    sendCompare,
    compareRoutes,
    webEnabled,
    newSession,
  ]);

  // ── Edit user message + resend ──
  const startEdit = (m: ChatMsg) => {
    if (loading) return;
    setEditingId(m.id);
    setEditingText(m.content);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditingText('');
  };
  const saveEditAndResend = async () => {
    if (!active || !editingId) return;
    const idx = active.messages.findIndex((m) => m.id === editingId);
    if (idx < 0) return;
    const truncated = active.messages.slice(0, idx);
    const replaced: ChatMsg = {
      ...active.messages[idx],
      content: editingText,
      edited: true,
    };
    setEditingId(null);
    setEditingText('');
    await sendWithMessages([...truncated, replaced]);
  };

  // ── Regenerate ──
  const regenerate = async (assistantId: string) => {
    if (!active || loading) return;
    const idx = active.messages.findIndex((m) => m.id === assistantId);
    if (idx < 0) return;
    const truncated = active.messages.slice(0, idx);
    await sendWithMessages(truncated);
  };

  // ── Retry on a different route/node ──
  const regenerateOnRoute = async (assistantId: string) => {
    if (!active || loading) return;
    const choice = window.prompt(
      'Retry this reply on which route?\n\nOptions: light, heavy, ' +
        nodesList.map((n) => n.name).join(', '),
      'heavy',
    );
    if (!choice) return;
    const idx = active.messages.findIndex((m) => m.id === assistantId);
    if (idx < 0) return;
    const truncated = active.messages.slice(0, idx);
    await sendWithMessages(truncated, { modelOverride: choice });
  };

  // ── Branch ──
  const branchFrom = (atId: string) => {
    if (!active) return;
    const idx = active.messages.findIndex((m) => m.id === atId);
    if (idx < 0) return;
    const sliced = active.messages.slice(0, idx + 1).map((m) => ({ ...m }));
    newSession({
      title: `${active.title} ↳`,
      messages: sliced,
      system: active.system,
      modelOverride: active.modelOverride,
      temperature: active.temperature,
      parentSessionId: active.id,
      branchFromMsgId: atId,
    });
  };

  // ── Pin / Star / Archive ──
  const togglePin = (id: string) =>
    persist(
      sessions.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)),
    );
  const toggleStar = (id: string) =>
    persist(
      sessions.map((s) => (s.id === id ? { ...s, starred: !s.starred } : s)),
    );
  const toggleArchive = (id: string) =>
    persist(
      sessions.map((s) => (s.id === id ? { ...s, archived: !s.archived } : s)),
    );

  // ── Voice input ──
  const {
    supported: micSupported,
    listening,
    start: micStart,
    stop: micStop,
  } = useSpeechRecognition((t) => {
    setInput((prev) => (prev ? prev + ' ' + t : t));
  });
  const [ttsOn, setTtsOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('chat-tts') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('chat-tts', ttsOn ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [ttsOn]);
  // Speak final assistant content when it appears
  const lastSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ttsOn || !active) return;
    const last = active.messages[active.messages.length - 1];
    if (
      last &&
      last.role === 'assistant' &&
      last.id !== lastSpokenRef.current
    ) {
      lastSpokenRef.current = last.id;
      speak(last.content);
    }
  }, [active, ttsOn]);

  // ── Attachments ──
  const onPickFiles = () => fileInputRef.current?.click();
  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const items: ChatAttachment[] = [];
    for (const f of Array.from(files)) {
      const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
      if (f.type.startsWith('image/')) {
        const dataUrl = await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result || ''));
          r.readAsDataURL(f);
        });
        items.push({ id, name: f.name, type: f.type, size: f.size, dataUrl });
      } else if (f.size <= 200_000) {
        const text = await f.text();
        items.push({
          id,
          name: f.name,
          type: f.type || 'text/plain',
          size: f.size,
          text,
        });
      } else {
        setStatusMsg(`Skipped ${f.name} (>200KB and not an image)`);
      }
    }
    setAttachments((prev) => [...prev, ...items]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const onPasteCompose = async (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
  ) => {
    const items = Array.from(e.clipboardData?.items || []);
    const files = items.map((i) => i.getAsFile()).filter(Boolean) as File[];
    if (files.length) {
      e.preventDefault();
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      onFiles(dt.files);
      return;
    }
    // Auto-detect URL paste — if the entire pasted text is one URL, offer to fetch.
    const txt = (e.clipboardData?.getData('text') || '').trim();
    if (/^https?:\/\/\S+$/.test(txt)) {
      // Don't intercept the paste — let it land in the input — but show an offer.
      setStatusMsg(`Press ⏎ or click “Fetch” to include ${txt} as context.`);
      // Add a transient attach option via slash-style helper:
      window.setTimeout(() => {
        // Reuse the status banner to show a clickable hint by injecting a fake button via state
        // (kept simple: user can run /web <url> or click the link below)
      }, 0);
    }
  };

  // ── Mention helpers (@app, @node) ──
  const [appsList, setAppsList] = useState<AppInfo[]>([]);
  const [nodesList, setNodesList] = useState<
    Array<{ name: string; tier?: string }>
  >([]);
  useEffect(() => {
    fetch(`${API_BASE}/api/apps`)
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setAppsList(d))
      .catch(() => {});
    fetch(`${API_BASE}/api/nodes`)
      .then((r) => r.json())
      .then(
        (d) =>
          Array.isArray(d) &&
          setNodesList(
            d.map((n: NodeConfig) => ({ name: n.name, tier: n.tier })),
          ),
      )
      .catch(() => {});
  }, []);
  const mentionState = useMemo(() => {
    const m = /(^|\s)@([a-zA-Z0-9_-]*)$/.exec(input);
    if (!m) return null;
    const q = m[2].toLowerCase();
    const apps = appsList
      .filter((a) => a.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map((a) => ({ kind: 'app' as const, name: a.name }));
    const nodes = nodesList
      .filter((n) => n.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map((n) => ({ kind: 'node' as const, name: n.name }));
    return {
      items: [...apps, ...nodes],
      replaceLen: m[0].length - (m[1].length || 0),
    };
  }, [input, appsList, nodesList]);
  const insertMention = (name: string) => {
    setInput((prev) =>
      prev.replace(
        /(^|\s)@[a-zA-Z0-9_-]*$/,
        (_full, lead) => `${lead}@${name} `,
      ),
    );
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (meta && e.key === 'j') {
        e.preventDefault();
        newSession();
      } else if (meta && e.key === '/') {
        e.preventDefault();
        setShowSlash((v) => !v);
        setInput((prev) => (prev.startsWith('/') ? prev : '/' + prev));
        setTimeout(() => inputRef.current?.focus(), 0);
      } else if (e.key === 'Escape') {
        if (searchOpen) setSearchOpen(false);
        else if (showSlash) setShowSlash(false);
        else if (editingId) cancelEdit();
        else if (loading) stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingId, loading, newSession, searchOpen, showSlash, stop]);

  // Slash menu visibility from input
  useEffect(() => {
    setShowSlash(input.startsWith('/') && input.split(/\s+/).length === 1);
  }, [input]);

  // Auto-dismiss transient status messages after 5s
  useEffect(() => {
    if (!statusMsg) return;
    const t = window.setTimeout(() => setStatusMsg(null), 5000);
    return () => window.clearTimeout(t);
  }, [statusMsg]);

  // Keyboard shortcuts (scoped to this panel via `data-chat`)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        newSession();
      } else if (meta && e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (meta && e.key.toLowerCase() === 'e' && !e.shiftKey) {
        e.preventDefault();
        exportSession();
      } else if (e.key === 'Escape') {
        if (loading) {
          e.preventDefault();
          stop();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Scroll-to-bottom detection
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const d = el.scrollHeight - el.scrollTop - el.clientHeight;
      setAtBottom(d < 40);
    };
    el.addEventListener('scroll', onScroll);
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [activeId]);

  // Auto-scroll when new content arrives, but only if user is already at bottom
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    if (atBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [displayMessages, atBottom]);

  // Smoother textarea autosize
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(240, ta.scrollHeight) + 'px';
  }, [input]);

  const filteredSessions = useMemo(() => {
    let arr = sessions.slice();
    if (showFilter === 'pinned') arr = arr.filter((s) => s.pinned);
    else if (showFilter === 'archived') arr = arr.filter((s) => s.archived);
    else arr = arr.filter((s) => !s.archived);
    arr.sort(
      (a, b) =>
        Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt,
    );
    return arr;
  }, [sessions, showFilter]);

  const sessionTokens = active
    ? (active.totalPromptTokens || 0) + (active.totalCompletionTokens || 0)
    : 0;

  const lastUserMsg = active
    ? [...active.messages].reverse().find((m) => m.role === 'user')
    : null;

  return (
    <div className="flex h-[calc(100vh-7rem)] -m-6 -mt-0 relative">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />

      {/* Sessions sidebar */}
      <div
        className={`${sideOpen ? 'w-60' : 'w-0'} transition-all overflow-hidden border-r border-border/10 bg-background/40 shrink-0 flex flex-col`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="px-3 pt-2.5 pb-1.5 flex items-center justify-between">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 font-medium">
              Chats
            </div>
            <div className="text-[9px] text-muted-foreground/30 tabular-nums">
              {sessions.length}
            </div>
          </div>

          {/* New Chat */}
          <div className="px-2.5 pb-2">
            <button
              onClick={() => newSession()}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-violet-300 bg-violet-500/10 hover:bg-violet-500/15 border border-violet-500/20 rounded transition-colors">
              <Plus size={11} /> New Chat
            </button>
          </div>

          {/* Filter pills */}
          <div className="px-2.5 pb-1.5">
            <div className="flex gap-0.5 text-[9.5px] bg-white/[0.02] rounded p-0.5">
              {(['all', 'pinned', 'archived'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setShowFilter(f)}
                  className={`flex-1 py-1 rounded transition-colors capitalize ${
                    showFilter === f
                      ? 'bg-foreground/10 text-foreground'
                      : 'text-muted-foreground/50 hover:text-foreground'
                  }`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Search + Schedules */}
          <div className="px-2.5 pb-2 space-y-1">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] text-muted-foreground/50 hover:text-foreground border border-border/15 rounded hover:bg-white/[0.03] transition-colors">
              <Search size={10} />
              <span className="flex-1 text-left">Search…</span>
              <span className="text-[9px] opacity-50">⌘K</span>
            </button>
            <button
              onClick={() => setSchedulesOpen(true)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] text-muted-foreground/50 hover:text-foreground border border-border/15 rounded hover:bg-white/[0.03] transition-colors">
              <Clock size={10} />
              <span className="flex-1 text-left">Schedules…</span>
            </button>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-auto pb-2 px-1">
            {filteredSessions.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-[10px] text-muted-foreground/30">
                  No sessions
                </p>
              </div>
            ) : (
              filteredSessions.map((s) => {
                const isActive = s.id === activeId;
                const msgCount = s.messages.filter(
                  (m) => m.role !== 'system' && !m.stepType,
                ).length;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setActiveId(s.id);
                      try {
                        localStorage.setItem('chat-active', s.id);
                      } catch {
                        /* ignore */
                      }
                    }}
                    title={s.title || 'Untitled'}
                    className={`group relative w-full flex items-start gap-1.5 pl-3 pr-1.5 py-1.5 text-left rounded transition-colors ${
                      isActive ? 'bg-white/[0.05]' : 'hover:bg-white/[0.025]'
                    }`}>
                    {/* Active accent bar */}
                    <span
                      className={`absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r ${
                        isActive ? 'bg-violet-400/70' : 'bg-transparent'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        {s.pinned && (
                          <Pin size={9} className="text-violet-400 shrink-0" />
                        )}
                        {s.starred && (
                          <Star size={9} className="text-amber-400 shrink-0" />
                        )}
                        <span
                          className={`flex-1 truncate text-[11px] ${
                            isActive
                              ? 'text-foreground font-medium'
                              : 'text-muted-foreground/75 group-hover:text-foreground/85'
                          }`}>
                          {s.title || 'Untitled'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[9px] text-muted-foreground/35 mt-0.5">
                        <span>{relTime(s.updatedAt)}</span>
                        {msgCount > 0 && (
                          <>
                            <span>·</span>
                            <span>{msgCount} msg</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
                      <span
                        title={s.pinned ? 'Unpin' : 'Pin'}
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(s.id);
                        }}
                        className="p-0.5 text-muted-foreground/50 hover:text-violet-300 cursor-pointer">
                        <Pin size={10} />
                      </span>
                      <span
                        title={s.archived ? 'Unarchive' : 'Archive'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleArchive(s.id);
                        }}
                        className="p-0.5 text-muted-foreground/50 hover:text-foreground cursor-pointer">
                        <Archive size={10} />
                      </span>
                      <span
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${s.title}"?`))
                            deleteSession(s.id);
                        }}
                        className="p-0.5 text-red-400/70 hover:text-red-300 cursor-pointer">
                        <Trash2 size={10} />
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/20">
          <button
            onClick={() => setSideOpen(!sideOpen)}
            className="text-muted-foreground hover:text-foreground text-sm">
            ☰
          </button>
          <span className="text-xs text-muted-foreground truncate flex-1">
            {active?.title || 'Chat'}
          </span>
          {active && (
            <>
              <button
                onClick={() => setSystemEditOpen((v) => !v)}
                title="System prompt / persona"
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${active.system ? 'border-violet-400/40 text-violet-300' : 'border-border/30 text-muted-foreground/60 hover:text-foreground'}`}>
                {active.system ? 'system ✓' : '+ system'}
              </button>
              <button
                onClick={() => toggleStar(active.id)}
                title="Star"
                className={`p-1 rounded hover:bg-white/5 ${active.starred ? 'text-amber-400' : 'text-muted-foreground/40'}`}>
                <Star size={12} />
              </button>
              <button
                onClick={exportSession}
                title="Export as Markdown"
                className="p-1 rounded hover:bg-white/5 text-muted-foreground/60 hover:text-foreground">
                <Download size={12} />
              </button>
              <button
                onClick={() =>
                  setTtsOn((v) => {
                    if (v) stopSpeaking();
                    return !v;
                  })
                }
                title={ttsOn ? 'Disable speech' : 'Speak replies'}
                className={`p-1 rounded hover:bg-white/5 ${ttsOn ? 'text-violet-300' : 'text-muted-foreground/40'}`}>
                <Volume2 size={12} />
              </button>
              {sessionTokens > 0 && (
                <span className="text-[10px] text-muted-foreground/50 font-mono ml-1">
                  {sessionTokens} tok
                </span>
              )}
            </>
          )}
        </div>

        {/* Resume banner */}
        {resumeBanner && (
          <div className="px-4 py-2 text-[11px] bg-amber-500/10 border-b border-amber-500/20 text-amber-200/90 flex items-center justify-between">
            <span>
              The previous request was interrupted. The reply may be missing.
            </span>
            <button
              onClick={() => setResumeBanner(false)}
              className="text-amber-200/70 hover:text-amber-100">
              <X size={12} />
            </button>
          </div>
        )}

        {/* System prompt editor */}
        {systemEditOpen && active && (
          <div className="px-4 py-3 border-b border-border/20 bg-white/[0.02] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
                System prompt / persona
              </span>
              <div className="flex items-center gap-1">
                {personas.map((p) => (
                  <button
                    key={p.id}
                    onClick={() =>
                      updateActive((s) => ({ ...s, system: p.system }))
                    }
                    title={p.name}
                    className="text-[10px] px-2 py-0.5 rounded border border-border/30 text-muted-foreground/70 hover:text-foreground hover:bg-white/5">
                    {p.emoji} {p.name}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={active.system || ''}
              onChange={(e) =>
                updateActive((s) => ({ ...s, system: e.target.value }))
              }
              rows={3}
              placeholder="e.g. You are a Rust expert. Reply in code-first style."
              className="w-full bg-black/30 border border-white/10 rounded p-2 text-[12px] text-foreground/90 placeholder:text-muted-foreground/30 focus:outline-none focus:border-violet-400/40 resize-none"
            />
            <div className="flex items-center gap-2 text-[10px]">
              <label className="text-muted-foreground/60">Temp</label>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={active.temperature ?? 0.7}
                onChange={(e) =>
                  updateActive((s) => ({
                    ...s,
                    temperature: parseFloat(e.target.value),
                  }))
                }
                className="w-16 bg-black/30 border border-white/10 rounded px-1 py-0.5 text-foreground/80 font-mono"
              />
              <label className="text-muted-foreground/60 ml-2">
                Default route
              </label>
              <select
                value={active.modelOverride || 'auto'}
                onChange={(e) =>
                  updateActive((s) => ({ ...s, modelOverride: e.target.value }))
                }
                className="bg-black/30 border border-white/10 rounded px-1 py-0.5 text-foreground/80">
                <option value="auto">auto</option>
                <option value="light">light</option>
                <option value="heavy">heavy</option>
                {nodesList.map((n) => (
                  <option key={n.name} value={n.name}>
                    {n.name}
                  </option>
                ))}
              </select>
              <span className="ml-auto text-muted-foreground/40">
                Saved per chat
              </span>
            </div>
          </div>
        )}

        {/* Messages — centered column */}
        <div
          ref={messagesScrollRef}
          className={`flex-1 overflow-auto relative ${dragOver ? 'ring-2 ring-inset ring-violet-400/40 bg-violet-500/5' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragOver) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
          }}>
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20 text-violet-200 text-sm">
              Drop to attach files
            </div>
          )}
          <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
            {displayMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="text-2xl opacity-20">◇</div>
                <p className="text-sm text-muted-foreground/50">
                  {active?.system
                    ? 'Persona active — send a message to begin'
                    : 'Send a message to start chatting'}
                </p>
                {active?.system && (
                  <div className="text-[10px] text-violet-300/60 max-w-md truncate font-mono px-4 py-1 border border-violet-400/20 rounded-full">
                    system: {active.system.slice(0, 80)}
                    {active.system.length > 80 ? '…' : ''}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 justify-center max-w-lg">
                  {SLASH_COMMANDS.slice(0, 10).map((c) => (
                    <button
                      key={c.cmd}
                      onClick={() => {
                        setInput(c.cmd + ' ');
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      title={c.hint}
                      className="text-[10px] px-2 py-1 rounded border border-border/30 text-muted-foreground/60 hover:text-foreground hover:bg-white/5 font-mono">
                      {c.cmd}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground/30 flex flex-wrap gap-x-3 gap-y-1 justify-center max-w-md">
                  <span>⌘N new</span>
                  <span>⌘K search</span>
                  <span>⌘/ focus</span>
                  <span>⌘↵ send</span>
                  <span>Esc stop</span>
                </div>
              </div>
            )}

            {/* Group consecutive system steps into a single collapsible reasoning block */}
            {(() => {
              const out: React.ReactNode[] = [];
              let i = 0;
              while (i < displayMessages.length) {
                const m = displayMessages[i];
                if (m.role === 'system' || m.stepType) {
                  let j = i;
                  const group: ChatMsg[] = [];
                  while (
                    j < displayMessages.length &&
                    (displayMessages[j].role === 'system' ||
                      displayMessages[j].stepType)
                  ) {
                    group.push(displayMessages[j]);
                    j++;
                  }
                  const groupKey = `g-${group[0].id}`;
                  const collapsed =
                    collapsedReasoning[groupKey] ?? group.length > 2;
                  out.push(
                    <div key={groupKey} className="text-[11px]">
                      <button
                        onClick={() =>
                          setCollapsedReasoning((p) => ({
                            ...p,
                            [groupKey]: !collapsed,
                          }))
                        }
                        className="flex items-center gap-1 text-muted-foreground/50 hover:text-muted-foreground/80">
                        {collapsed ? (
                          <ChevronRight size={10} />
                        ) : (
                          <ChevronDown size={10} />
                        )}
                        Reasoning ({group.length})
                      </button>
                      {!collapsed && (
                        <div className="ml-3 mt-1 space-y-1">
                          {group.map((g) => (
                            <div key={g.id} className="flex items-center gap-2">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  g.stepType === 'classified'
                                    ? 'bg-violet-400'
                                    : g.stepType === 'generating'
                                      ? 'bg-blue-400 animate-pulse'
                                      : g.stepType === 'classifying'
                                        ? 'bg-zinc-400 animate-pulse'
                                        : g.stepType === 'searching'
                                          ? 'bg-blue-400 animate-pulse'
                                          : g.stepType === 'error'
                                            ? 'bg-red-400'
                                            : 'bg-zinc-400'
                                }`}
                              />
                              <span className="text-muted-foreground">
                                {g.content}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>,
                  );
                  i = j;
                  continue;
                }
                if (m.role === 'user') {
                  out.push(
                    <div key={m.id} className="flex justify-end group">
                      {editingId === m.id ? (
                        <div className="w-full max-w-[85%] space-y-1">
                          <textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            rows={Math.min(
                              6,
                              Math.max(2, editingText.split('\n').length),
                            )}
                            className="w-full bg-black/30 border border-violet-400/40 rounded p-2 text-sm text-foreground focus:outline-none resize-none"
                          />
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={cancelEdit}
                              className="text-[10px] px-2 py-1 text-muted-foreground hover:text-foreground">
                              Cancel
                            </button>
                            <button
                              onClick={saveEditAndResend}
                              className="text-[10px] px-2 py-1 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/30 rounded text-violet-100">
                              Save & resend
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-foreground/10 rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[85%] relative">
                          <p className="text-sm whitespace-pre-wrap">
                            {m.content.split(/\n\n--- Attached: /)[0]}
                          </p>
                          {m.attachments && m.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {m.attachments.map((a) => (
                                <span
                                  key={a.id}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-foreground/70">
                                  📎 {a.name}
                                </span>
                              ))}
                            </div>
                          )}
                          {m.edited && (
                            <span className="text-[9px] text-muted-foreground/40 ml-1">
                              (edited)
                            </span>
                          )}
                          <button
                            onClick={() => startEdit(m)}
                            title="Edit & resend"
                            className="absolute -left-7 top-2 opacity-0 group-hover:opacity-100 p-1 text-muted-foreground/50 hover:text-foreground rounded transition-opacity">
                            <Pencil size={11} />
                          </button>
                        </div>
                      )}
                    </div>,
                  );
                  i++;
                  continue;
                }
                // assistant
                const reasoning =
                  m.reasoningSteps && m.reasoningSteps.length > 1;
                const reasoningKey = `r-${m.id}`;
                const reasoningCollapsed =
                  collapsedReasoning[reasoningKey] ?? true;
                out.push(
                  <div key={m.id} className="flex justify-start group">
                    <div className="rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[85%] space-y-2 w-full">
                      {reasoning && (
                        <div className="text-[10px]">
                          <button
                            onClick={() =>
                              setCollapsedReasoning((p) => ({
                                ...p,
                                [reasoningKey]: !reasoningCollapsed,
                              }))
                            }
                            className="flex items-center gap-1 text-muted-foreground/50 hover:text-muted-foreground/80">
                            {reasoningCollapsed ? (
                              <ChevronRight size={9} />
                            ) : (
                              <ChevronDown size={9} />
                            )}
                            Reasoning ({m.reasoningSteps?.length})
                          </button>
                          {!reasoningCollapsed && (
                            <div className="ml-3 mt-1 space-y-0.5 text-muted-foreground/70">
                              {m.reasoningSteps?.map((r, ri) => (
                                <div key={ri}>· {r.text}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {m.content.startsWith('__COMPARE__') ? (
                        <CompareBlock
                          payload={m.content.slice('__COMPARE__'.length).trim()}
                        />
                      ) : (
                        (() => {
                          const sections = m.content
                            .split(/\n-{3,}\n/)
                            .map((s) => s.trim())
                            .filter(Boolean);
                          if (sections.length <= 1)
                            return <MarkdownView text={m.content} />;
                          return (
                            <div className="space-y-2">
                              {sections.map((s, si) => (
                                <div
                                  key={si}
                                  className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2">
                                  <MarkdownView text={s} />
                                </div>
                              ))}
                            </div>
                          );
                        })()
                      )}
                      {/* Trace strip */}
                      {(m.node || m.latency) && (
                        <div className="flex flex-wrap gap-2 pt-1 items-center text-[10px] text-muted-foreground/60">
                          {m.node && (
                            <span className="text-violet-400/80">{m.node}</span>
                          )}
                          {m.tier && (
                            <span className="opacity-60">· {m.tier}</span>
                          )}
                          {m.model && (
                            <span className="font-mono opacity-60">
                              · {m.model}
                            </span>
                          )}
                          {m.latency && <span>· {m.latency}</span>}
                          {m.classifierLatency && (
                            <span>· cls {m.classifierLatency}</span>
                          )}
                          {m.totalTokens != null && m.totalTokens > 0 && (
                            <span className="font-mono">
                              · {m.promptTokens}→{m.completionTokens} (
                              {m.totalTokens} tok)
                            </span>
                          )}
                          <span className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => copyToClipboard(m.content)}
                              title="Copy reply"
                              className="p-0.5 hover:text-foreground">
                              <Copy size={10} />
                            </button>
                            <button
                              onClick={() => regenerate(m.id)}
                              title="Regenerate"
                              className="p-0.5 hover:text-foreground">
                              <RefreshCw size={10} />
                            </button>
                            <button
                              onClick={() => regenerateOnRoute(m.id)}
                              title="Retry on different node…"
                              className="p-0.5 hover:text-foreground">
                              <Cpu size={10} />
                            </button>
                            <button
                              onClick={() => branchFrom(m.id)}
                              title="Branch from here"
                              className="p-0.5 hover:text-foreground">
                              <GitBranch size={10} />
                            </button>
                            <button
                              onClick={() =>
                                saveSnippet({
                                  title: active?.title || 'Reply',
                                  body: m.content,
                                  kind: 'reply',
                                })
                              }
                              title="Save as snippet"
                              className="p-0.5 hover:text-foreground">
                              <Star size={10} />
                            </button>
                            <button
                              onClick={() => speak(m.content)}
                              title="Speak"
                              className="p-0.5 hover:text-foreground">
                              <Volume2 size={10} />
                            </button>
                            <button
                              onClick={() =>
                                gotoPage('apps', { prompt: m.content })
                              }
                              title="Send to Apps wizard"
                              className="p-0.5 hover:text-foreground">
                              <Blocks size={10} />
                            </button>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>,
                );
                i++;
              }
              return out;
            })()}
          </div>
        </div>

        {/* Scroll-to-bottom floating button */}
        {!atBottom && displayMessages.length > 3 && (
          <button
            onClick={() => {
              const el = messagesScrollRef.current;
              if (el) el.scrollTop = el.scrollHeight;
            }}
            title="Jump to latest"
            className="absolute bottom-28 right-6 p-2 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-200 hover:bg-violet-500/30 shadow-lg z-10 transition-colors">
            <ChevronDown size={14} />
          </button>
        )}

        {/* Status / slash menu / mention menu */}
        {statusMsg && (
          <div className="px-4 py-1 text-[11px] text-muted-foreground/70 border-t border-border/10 bg-white/[0.02] flex items-start gap-2 max-w-3xl mx-auto w-full">
            <span className="whitespace-pre-wrap flex-1">{statusMsg}</span>
            <button
              onClick={() => setStatusMsg(null)}
              className="text-muted-foreground/40 hover:text-foreground">
              <X size={11} />
            </button>
          </div>
        )}

        {/* Composer */}
        <div className="border-t border-border/20 p-3 relative">
          <div className="max-w-3xl mx-auto space-y-2">
            {/* Attachments preview */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {attachments.map((a) => (
                  <span
                    key={a.id}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-white/10 text-foreground/80">
                    📎 {a.name}
                    <button
                      onClick={() =>
                        setAttachments((p) => p.filter((x) => x.id !== a.id))
                      }
                      className="text-muted-foreground hover:text-red-300">
                      <X size={9} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Per-turn model override pill */}
            {pendingModel && (
              <div className="flex items-center gap-1 text-[10px]">
                <span className="text-muted-foreground/60">Next turn →</span>
                <span className="px-2 py-0.5 rounded bg-violet-500/15 border border-violet-400/30 text-violet-200">
                  {pendingModel}
                </span>
                <button
                  onClick={() => setPendingModel('')}
                  className="text-muted-foreground/60 hover:text-foreground">
                  <X size={10} />
                </button>
              </div>
            )}

            {/* Tool-calling pill */}
            {toolsEnabled && (
              <div className="flex items-center gap-1 text-[10px]">
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-emerald-200">
                  tools: on
                </span>
                <button
                  onClick={() => setToolsEnabled(false)}
                  className="text-muted-foreground/60 hover:text-foreground">
                  <X size={10} />
                </button>
              </div>
            )}

            {/* Web-search pill */}
            {webEnabled && (
              <div className="flex items-center gap-1 text-[10px]">
                <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/30 text-sky-200">
                  🌐 web: on (next message will search the web)
                </span>
                <button
                  onClick={() => setWebEnabled(false)}
                  className="text-muted-foreground/60 hover:text-foreground">
                  <X size={10} />
                </button>
              </div>
            )}

            {/* Compare-mode pill */}
            {compareRoutes && (
              <div className="flex items-center gap-1 text-[10px]">
                <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-amber-200">
                  compare: {compareRoutes.join(' vs ')}
                </span>
                <button
                  onClick={() => setCompareRoutes(null)}
                  className="text-muted-foreground/60 hover:text-foreground">
                  <X size={10} />
                </button>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              {/* Toolbar row — kept separate so the Send button is always visible */}
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={onPickFiles}
                  title="Attach file"
                  disabled={loading}
                  className="p-1.5 text-muted-foreground/60 hover:text-foreground rounded hover:bg-white/5 disabled:opacity-30">
                  <Plus size={14} />
                </button>
                {micSupported && (
                  <button
                    onClick={() => (listening ? micStop() : micStart())}
                    title={listening ? 'Stop listening' : 'Voice input'}
                    className={`p-1.5 rounded hover:bg-white/5 ${listening ? 'text-red-400 animate-pulse' : 'text-muted-foreground/60 hover:text-foreground'}`}>
                    <Mic size={14} />
                  </button>
                )}
                <button
                  onClick={() => setWebEnabled((v) => !v)}
                  title={
                    webEnabled
                      ? 'Web search: ON for next message'
                      : 'Enable web search for next message'
                  }
                  disabled={loading}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded text-[11px] hover:bg-white/5 disabled:opacity-30 transition-colors ${webEnabled ? 'text-sky-300 bg-sky-500/10 border border-sky-500/30' : 'text-muted-foreground/60 hover:text-foreground border border-transparent'}`}>
                  <Globe size={12} />
                  <span>Web</span>
                </button>
                <select
                  value={pendingModel}
                  onChange={(e) => setPendingModel(e.target.value)}
                  title="Override route for next turn"
                  className="text-[10px] bg-black/30 border border-border/30 rounded px-1.5 py-1 text-muted-foreground/70 focus:outline-none focus:text-foreground">
                  <option value="">auto</option>
                  <option value="light">light</option>
                  <option value="heavy">heavy</option>
                  {nodesList.map((n) => (
                    <option key={n.name} value={n.name}>
                      {n.name}
                    </option>
                  ))}
                </select>
                <div className="flex-1" />
                <span className="text-[9px] text-muted-foreground/40 hidden sm:inline">
                  ⌘↵ to send
                </span>
              </div>

              {/* Input row */}
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onPaste={onPasteCompose}
                  onKeyDown={(e) => {
                    if (
                      e.key === 'Enter' &&
                      !e.shiftKey &&
                      (e.metaKey || e.ctrlKey || !e.altKey)
                    ) {
                      if (!e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    } else if (e.key === 'ArrowUp' && !input && lastUserMsg) {
                      e.preventDefault();
                      startEdit(lastUserMsg);
                    } else if (
                      e.key === 'Tab' &&
                      mentionState &&
                      mentionState.items.length > 0
                    ) {
                      e.preventDefault();
                      insertMention(mentionState.items[0].name);
                    }
                  }}
                  placeholder={
                    loading
                      ? 'Generating… press Esc to stop'
                      : webEnabled
                        ? '🌐 Web is ON — your message will search the web first…'
                        : 'Message…   /  for commands,  @  to mention'
                  }
                  rows={1}
                  className="flex-1 min-w-0 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none overflow-hidden"
                />
                {loading ? (
                  <Button
                    onClick={stop}
                    size="sm"
                    variant="destructive"
                    className="px-3 shrink-0"
                    title="Stop (Esc)">
                    <Square size={14} />
                  </Button>
                ) : (
                  <Button
                    onClick={send}
                    disabled={!input.trim() && attachments.length === 0}
                    size="sm"
                    className="px-3 shrink-0"
                    title="Send (⌘↵)">
                    <Send size={14} />
                  </Button>
                )}
              </div>
            </div>

            {/* Slash menu */}
            {showSlash && (
              <div className="absolute bottom-full left-3 right-3 mb-2 max-w-3xl mx-auto bg-[#0a0a0a] border border-white/10 rounded-lg shadow-xl overflow-hidden z-10">
                {SLASH_COMMANDS.filter(
                  (c) => c.cmd.startsWith(input.split(' ')[0]) || input === '/',
                ).map((c) => (
                  <button
                    key={c.cmd}
                    onClick={() => {
                      setInput(c.cmd + ' ');
                      setTimeout(() => inputRef.current?.focus(), 0);
                      setShowSlash(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-[11px] flex items-baseline gap-2">
                    <span className="font-mono text-violet-300">{c.cmd}</span>
                    <span className="text-muted-foreground/60">{c.hint}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Mention menu */}
            {mentionState && mentionState.items.length > 0 && (
              <div className="absolute bottom-full left-3 right-3 mb-2 max-w-3xl mx-auto bg-[#0a0a0a] border border-white/10 rounded-lg shadow-xl overflow-hidden z-10">
                {mentionState.items.map((it) => (
                  <button
                    key={`${it.kind}:${it.name}`}
                    onClick={() => insertMention(it.name)}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-[11px] flex items-center gap-2">
                    <span
                      className={`text-[9px] uppercase tracking-wider ${it.kind === 'app' ? 'text-blue-300/70' : 'text-amber-300/70'}`}>
                      {it.kind}
                    </span>
                    <span className="font-mono text-foreground">
                      @{it.name}
                    </span>
                    <span className="ml-auto text-[9px] text-muted-foreground/40">
                      ↹ Tab
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search palette */}
      {searchOpen && (
        <SearchPalette
          sessions={sessions}
          query={searchQ}
          setQuery={setSearchQ}
          onPick={(id) => {
            setActiveId(id);
            try {
              localStorage.setItem('chat-active', id);
            } catch {
              /* ignore */
            }
            setSearchOpen(false);
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* Schedules modal */}
      {schedulesOpen && (
        <SchedulesModal onClose={() => setSchedulesOpen(false)} />
      )}

      {/* Persona library trigger (subtle) */}
      <PersonaQuickAdd personas={personas} onSave={persistPersonas} />
    </div>
  );
}

/* ── Settings Panel (Config + Node CRUD) ── */

