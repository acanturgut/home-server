import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chatApi } from '@/features/chat/api';
import { gotoPage } from '@/lib/format';
import { speak, useSpeechRecognition } from '@/lib/voice';
import { SLASH_COMMANDS } from '@/lib/slash';
import {
  BUILTIN_PERSONAS,
  DEFAULT_SYSTEM_PROMPT,
  type ChatAttachment,
  type ChatMsg,
  type ChatSession,
  type Persona,
} from '@/features/chat/types';
import type { AppInfo } from '@/lib/types';
import type { NodeConfig } from '@/features/settings';

export function useChatPanel() {
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
  // Quick mode: when ON, every turn is forced to the on-device ollama
  // backend ("local") and all heavy features (tools, web, compare) are
  // suppressed. Persists across composer turns until the user toggles off.
  const [quickMode, setQuickModeState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('chat-quick') === '1';
    } catch {
      return false;
    }
  });
  const setQuickMode = useCallback((v: boolean) => {
    setQuickModeState(v);
    try {
      localStorage.setItem('chat-quick', v ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (v) {
      setToolsEnabled(false);
      setWebEnabled(false);
      setCompareRoutes(null);
    }
  }, []);
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
      chatApi.saveSessions(updated).catch(() => {});
    }, 600);
  }, []);
  // Initial server load (overrides localStorage if present and non-empty)
  useEffect(() => {
    chatApi.loadSessions().then((arr) => {
      if (Array.isArray(arr) && arr.length > 0) {
        setSessions(arr);
        try {
          localStorage.setItem('chat-sessions', JSON.stringify(arr));
        } catch {
          /* ignore */
        }
      }
    });
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
        const r = await chatApi.postChat({
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
      const r = await chatApi.saveSnippet({
        title,
        body,
        kind: kind || 'reply',
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
      const data = await chatApi.fetchUrl(rawUrl);
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
      const data = await chatApi.ragSearch(q, 5);
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
      const data = await chatApi.createSchedule({
        cron,
        prompt,
        enabled: true,
      });
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
      const data = (await chatApi.compare({
        messages: apiMsgs,
        routes,
        temperature: active.temperature,
      })) as { runs: unknown };
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
        // Quick mode = simple chat on the on-device ollama; skip the
        // tool-calling system prompt entirely.
        const toolSys =
          toolsEnabled && !quickMode
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
        // Quick mode forces "local" (on-device ollama) and overrides any
        // session-level or per-turn route the user had set.
        const override = quickMode
          ? 'local'
          : opts?.modelOverride || active.modelOverride;
        if (override && override !== 'auto') body.route = override;
        if (active.temperature != null) body.temperature = active.temperature;

        const res = await chatApi.streamChat(body, ctrl.signal);
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
    [active, sessions, persist, autoTitle, toolsEnabled, quickMode],
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
        const r = await chatApi.webSearchFetch(
          { q: text, k: 3, perPageChars: 3500 },
          ctrl.signal,
        );
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
    chatApi.listApps().then((d) => Array.isArray(d) && setAppsList(d));
    chatApi
      .listNodes()
      .then(
        (d) =>
          Array.isArray(d) &&
          setNodesList(
            (d as NodeConfig[]).map((n) => ({ name: n.name, tier: n.tier })),
          ),
      );
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

  return {
    exportSession,
    saveSnippet,
    active,
    activeId,
    atBottom,
    attachments,
    branchFrom,
    cancelEdit,
    collapsedReasoning,
    compareRoutes,
    deleteSession,
    displayMessages,
    dragOver,
    editingId,
    editingText,
    fileInputRef,
    filteredSessions,
    input,
    inputRef,
    insertMention,
    lastUserMsg,
    listening,
    loading,
    mentionState,
    messagesScrollRef,
    micStart,
    micStop,
    micSupported,
    newSession,
    nodesList,
    onFiles,
    onPasteCompose,
    onPickFiles,
    pendingModel,
    persistPersonas,
    personas,
    quickMode,
    regenerate,
    regenerateOnRoute,
    resumeBanner,
    saveEditAndResend,
    schedulesOpen,
    searchOpen,
    searchQ,
    send,
    sessionTokens,
    sessions,
    setActiveId,
    setAttachments,
    setCollapsedReasoning,
    setCompareRoutes,
    setDragOver,
    setEditingText,
    setInput,
    setPendingModel,
    setQuickMode,
    setResumeBanner,
    setSchedulesOpen,
    setSearchOpen,
    setSearchQ,
    setShowFilter,
    setShowSlash,
    setSideOpen,
    setStatusMsg,
    setSystemEditOpen,
    setToolsEnabled,
    setTtsOn,
    setWebEnabled,
    showFilter,
    showSlash,
    sideOpen,
    startEdit,
    statusMsg,
    stop,
    systemEditOpen,
    toggleArchive,
    togglePin,
    toggleStar,
    toolsEnabled,
    ttsOn,
    updateActive,
    webEnabled,
  };
}
