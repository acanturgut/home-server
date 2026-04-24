import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import type { AppInfo, BuildEvent } from '@/lib/types';
import { buildTree, type AppFile } from '@/features/apps/components/CodeEditor';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function useAppsPanel() {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [selectedApp, setSelectedApp] = useState<string | null>(() =>
    localStorage.getItem('selectedApp'),
  );
  const [prompt, setPrompt] = useState('');

  // Listen for cross-panel handoff (e.g. from Chat → "Send to Apps")
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { prompt?: string }
        | undefined;
      if (detail?.prompt) {
        setPrompt(detail.prompt);
        setSelectedApp(null);
      }
    };
    window.addEventListener('apps:prefill-prompt', onPrefill as EventListener);
    return () =>
      window.removeEventListener(
        'apps:prefill-prompt',
        onPrefill as EventListener,
      );
  }, []);
  // ── AI Clarify (pre-build wizard) ──
  type ClarifyQ = {
    id: string;
    question: string;
    hint?: string;
    suggestions?: string[];
    required?: boolean;
    default?: string;
  };
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [clarifyLoading, setClarifyLoading] = useState(false);
  const [clarifyError, setClarifyError] = useState<string | null>(null);
  const [claritySummary, setClaritySummary] = useState('');
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarifyQ[]>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string>>(
    {},
  );
  const [clarifyName, setClarifyName] = useState('');
  const [clarifyNotes, setClarifyNotes] = useState('');
  const [building, setBuilding] = useState(() =>
    JSON.parse(localStorage.getItem('building') || 'false'),
  );
  const [events, setEvents] = useState<BuildEvent[]>(() =>
    (() => {
      try {
        const v = JSON.parse(localStorage.getItem('buildEvents') || '[]');
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    })(),
  );

  // Clear stale building state on mount — if we think we're building but have no active stream,
  // the previous SSE connection was lost (e.g. container restart / page refresh)
  useEffect(() => {
    const wasBuilding = JSON.parse(localStorage.getItem('building') || 'false');
    if (wasBuilding && !abortRef.current) {
      // Check if the last event is already terminal
      try {
        const evts = JSON.parse(localStorage.getItem('buildEvents') || '[]');
        const last =
          Array.isArray(evts) && evts.length > 0 ? evts[evts.length - 1] : null;
        if (last && (last.step === 'done' || last.step === 'error')) {
          setBuilding(false);
        } else {
          // Add a "connection lost" event and stop building
          setEvents((prev) => [
            ...prev,
            {
              step: 'error',
              message:
                'Connection lost — build may have completed. Check app status.',
            },
          ]);
          setBuilding(false);
        }
      } catch {
        setBuilding(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Code editor state
  const [files, setFiles] = useState<AppFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [fileDirty, setFileDirty] = useState(false);
  const [fileSaving, setFileSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployEvents, setDeployEvents] = useState<BuildEvent[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // File tree expand state
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    new Set(['src', 'src/components']),
  );

  // Right panel tab
  const [rightTab, setRightTab] = useState<'info' | 'build' | 'chat'>('info');
  // Bottom panel state
  const [bottomState, setBottomState] = useState<
    'minimized' | 'normal' | 'expanded'
  >('normal');
  const [bottomTab, setBottomTab] = useState<'events' | 'logs' | 'terminal'>(
    'events',
  );
  const [bottomSplit, setBottomSplit] = useState(false);
  const [bottomSplitTab, setBottomSplitTab] = useState<
    'events' | 'logs' | 'terminal'
  >('logs');

  // App logs state
  const [appLogs, setAppLogs] = useState('');
  const [appLogsLoading, setAppLogsLoading] = useState(false);
  const appLogsRef = useRef<HTMLPreElement>(null);

  // Container stats
  const [containerStats, setContainerStats] = useState<Record<
    string,
    string
  > | null>(null);

  // File search
  const [fileSearch, setFileSearch] = useState('');
  const [searchResults, setSearchResults] = useState<
    { file: string; line: number; text: string }[]
  >([]);
  const [searching, setSearching] = useState(false);

  // Terminal state
  const [termCmd, setTermCmd] = useState('');
  const [termHistory, setTermHistory] = useState<
    { cmd: string; output: string; status: string }[]
  >([]);
  const [termRunning, setTermRunning] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);

  // App settings edit
  const [editIcon, setEditIcon] = useState('');
  const [editRoute, setEditRoute] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Git history (per-app local repo)
  type GitCommit = {
    sha: string;
    short_sha: string;
    subject: string;
    body?: string;
    timestamp: string;
    action?: string;
    files?: number;
  };
  const [gitOpen, setGitOpen] = useState(false);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [diffSha, setDiffSha] = useState<string | null>(null);
  const [diffText, setDiffText] = useState('');
  const [diffMode, setDiffMode] = useState<'split' | 'unified'>('split');
  const [diffLayout, setDiffLayout] = useState<'all' | 'single'>('single');

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  // @-mention autocomplete state for chat
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [changeInput, setChangeInput] = useState('');
  const [actionType, setActionType] = useState<'feature' | 'fix' | 'bug'>(
    'feature',
  );
  const chatRef = useRef<HTMLDivElement>(null);

  // Compute-node selection for Build/Rebuild/Fix runs ('' = auto)
  type WorkerNode = {
    id: string;
    name: string;
    host: string;
    tier?: string;
  };
  const [workerNodes, setWorkerNodes] = useState<WorkerNode[]>([]);
  const [selectedBuildNode, setSelectedBuildNode] = useState<string>(
    () => localStorage.getItem('selectedBuildNode') || '',
  );
  useEffect(() => {
    if (selectedBuildNode)
      localStorage.setItem('selectedBuildNode', selectedBuildNode);
    else localStorage.removeItem('selectedBuildNode');
  }, [selectedBuildNode]);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(`${API_BASE}/api/nodes`)
        .then((r) => r.json())
        .then((n) => {
          if (cancelled) return;
          setWorkerNodes(Array.isArray(n) ? n : []);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const refresh = useCallback(() => {
    fetch(`${API_BASE}/api/apps`)
      .then((r) => r.json())
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        const sorted = arr.sort((a: AppInfo, b: AppInfo) =>
          a.name.localeCompare(b.name),
        );
        setApps(sorted);
        if (!selectedApp && sorted.length > 0) setSelectedApp(sorted[0].name);
      })
      .catch(() => {});
  }, [selectedApp]);

  useEffect(() => {
    if (selectedApp) localStorage.setItem('selectedApp', selectedApp);
    else localStorage.removeItem('selectedApp');
  }, [selectedApp]);

  // Refresh git log when the selected app changes (or after a build/fix completes).
  const loadCommits = useCallback(() => {
    if (!selectedApp) {
      setCommits([]);
      return;
    }
    fetch(`${API_BASE}/api/apps/${selectedApp}/git/log?limit=50`)
      .then((r) => r.json())
      .then((d) => setCommits(Array.isArray(d.commits) ? d.commits : []))
      .catch(() => setCommits([]));
  }, [selectedApp]);
  useEffect(() => {
    loadCommits();
  }, [loadCommits, building]);

  // Load diff lazily when the user opens a commit.
  useEffect(() => {
    if (!selectedApp || !diffSha) {
      setDiffText('');
      return;
    }
    setDiffText('Loading…');
    fetch(`${API_BASE}/api/apps/${selectedApp}/git/diff/${diffSha}`)
      .then((r) => r.json())
      .then((d) => setDiffText(d.diff || '(empty diff)'))
      .catch(() => setDiffText('Failed to load diff'));
  }, [selectedApp, diffSha]);

  useEffect(() => {
    localStorage.setItem('buildEvents', JSON.stringify(events));
  }, [events]);
  useEffect(() => {
    localStorage.setItem('building', JSON.stringify(building));
  }, [building]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, building ? 3000 : 10000);
    return () => clearInterval(id);
  }, [refresh, building]);

  // Load files
  const loadFiles = useCallback(() => {
    if (!selectedApp) {
      setFiles([]);
      return;
    }
    fetch(`${API_BASE}/api/apps/${selectedApp}/files`)
      .then((r) => r.json())
      .then((data: AppFile[]) => {
        const arr = Array.isArray(data) ? data : [];
        setFiles(arr);
        if (arr.length > 0 && !selectedFile) {
          const main =
            arr.find((f: AppFile) => f.path === 'src/App.jsx') ||
            arr.find((f: AppFile) => f.path.includes('src/')) ||
            arr.find((f: AppFile) => f.path === 'server.js') ||
            arr[0];
          setSelectedFile(main.path);
        }
      })
      .catch(() => setFiles([]));
  }, [selectedApp, selectedFile]);

  useEffect(() => {
    setSelectedFile(null);
    setFileContent('');
    setFileDirty(false);
    setChatMessages([]);
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedApp]);

  useEffect(() => {
    if (!building || !selectedApp) return;
    const id = setInterval(loadFiles, 2000);
    return () => clearInterval(id);
  }, [building, selectedApp, loadFiles]);

  useEffect(() => {
    if (!selectedApp || !selectedFile) return;
    setFileLoading(true);
    setFileDirty(false);
    fetch(`${API_BASE}/api/apps/${selectedApp}/files/${selectedFile}`)
      .then((r) => r.json())
      .then((data) => setFileContent(data.content || ''))
      .catch(() => setFileContent('// Failed to load file'))
      .finally(() => setFileLoading(false));
  }, [selectedApp, selectedFile]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events]);
  useEffect(() => {
    if (chatRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages]);

  // Load app logs when logs tab is active in bottom panel
  useEffect(() => {
    const logsActive =
      bottomState !== 'minimized' &&
      (bottomTab === 'logs' || (bottomSplit && bottomSplitTab === 'logs'));
    if (!logsActive || !selectedApp) return;
    const load = () => {
      setAppLogsLoading(true);
      fetch(`${API_BASE}/api/apps/${selectedApp}/logs?tail=200`)
        .then((r) => r.json())
        .then((d) => setAppLogs(d.logs || ''))
        .catch(() => setAppLogs('Failed to load logs'))
        .finally(() => setAppLogsLoading(false));
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [bottomTab, bottomSplit, bottomSplitTab, bottomState, selectedApp]);

  // Scroll app logs to bottom
  useEffect(() => {
    if (appLogsRef.current)
      appLogsRef.current.scrollTop = appLogsRef.current.scrollHeight;
  }, [appLogs]);

  // Load container stats when info tab active
  useEffect(() => {
    if (rightTab !== 'info' || !selectedApp) return;
    const load = () => {
      fetch(`${API_BASE}/api/apps/${selectedApp}/stats`)
        .then((r) => r.json())
        .then((d) => setContainerStats(d))
        .catch(() => setContainerStats(null));
    };
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [rightTab, selectedApp]);

  // Reset settings on app change
  useEffect(() => {
    if (app) {
      setEditIcon(app.icon || '');
      setEditRoute(app.route || '');
    }
    setSettingsOpen(false);
  }, [selectedApp]);

  // File search
  const doSearch = useCallback(() => {
    if (!fileSearch.trim() || !selectedApp) return;
    setSearching(true);
    fetch(
      `${API_BASE}/api/apps/${selectedApp}/search?q=${encodeURIComponent(fileSearch)}`,
    )
      .then((r) => r.json())
      .then((d) => setSearchResults(Array.isArray(d) ? d : []))
      .catch(() => setSearchResults([]))
      .finally(() => setSearching(false));
  }, [fileSearch, selectedApp]);

  // Terminal exec
  const runTermCmd = async () => {
    if (!termCmd.trim() || termRunning || !selectedApp) return;
    setTermRunning(true);
    const cmd = termCmd.trim();
    setTermCmd('');
    try {
      const res = await fetch(`${API_BASE}/api/apps/${selectedApp}/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json();
      setTermHistory((prev) => [
        ...prev,
        {
          cmd,
          output: data.output || data.error || '',
          status: data.status || 'ok',
        },
      ]);
    } catch {
      setTermHistory((prev) => [
        ...prev,
        { cmd, output: 'Failed to execute', status: 'error' },
      ]);
    }
    setTermRunning(false);
  };

  // Scroll terminal to bottom
  useEffect(() => {
    if (termRef.current)
      termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [termHistory]);

  // Save app settings
  const saveSettings = async () => {
    if (!selectedApp) return;
    await fetch(`${API_BASE}/api/apps/${selectedApp}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        icon: editIcon || undefined,
        route: editRoute || undefined,
      }),
    });
    refresh();
    setSettingsOpen(false);
  };

  // Stream build
  const streamNDJSON = async (url: string, body: object) => {
    setBuilding(true);
    setEvents([]);
    setRightTab('info');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        let msg = `Request failed (${res.status})`;
        try {
          const b = await res.json();
          if (b.error) msg = b.error;
        } catch {
          /* ignore */
        }
        setEvents((prev) => [...prev, { step: 'error', message: msg }]);
        setBuilding(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '',
        lastTime = Date.now();
      const watchdog = setInterval(() => {
        if (Date.now() - lastTime > 5 * 60 * 1000) {
          controller.abort();
          clearInterval(watchdog);
        }
      }, 30000);
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          lastTime = Date.now();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.trim()) {
              try {
                const evt = JSON.parse(line);
                if (evt.step !== 'keepalive')
                  setEvents((prev) => [...prev, evt]);
              } catch {
                /* ignore */
              }
            }
          }
        }
      } finally {
        clearInterval(watchdog);
      }
    } catch (e) {
      setEvents((prev) => [
        ...prev,
        {
          step: 'error',
          message: `Connection lost: ${e instanceof Error ? e.message : 'Failed'}. Build may still be running.`,
        },
      ]);
    }
    setBuilding(false);
    setPrompt('');
    abortRef.current = null;
    refresh();
    setTimeout(loadFiles, 1000);
  };

  const cancelBuild = async () => {
    // Call server-side cancel API first
    if (selectedApp) {
      try {
        await fetch(`${API_BASE}/api/apps/${selectedApp}/cancel`, {
          method: 'POST',
        });
      } catch {
        /* ignore */
      }
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setEvents((prev) => [
      ...prev,
      { step: 'error', message: 'Build cancelled by user' },
    ]);
    setBuilding(false);
  };

  const startBuild = () => {
    if (!prompt.trim() || building) return;
    streamNDJSON(`${API_BASE}/api/apps/build`, {
      prompt: prompt.trim(),
      node: selectedBuildNode || undefined,
    });
  };

  // ── AI Clarify wizard ──
  const openClarify = async () => {
    if (building || clarifyLoading) return;
    // Always open the wizard. If we already have a prompt, auto-run clarify;
    // otherwise the wizard shows an editable prompt textarea + Refine button.
    setClarifyOpen(true);
    setClarifyError(null);
    setClarifyQuestions([]);
    setClarifyAnswers({});
    setClaritySummary('');
    setClarifyName('');
    setClarifyNotes('');
    if (!prompt.trim()) return;
    setClarifyLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/apps/clarify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Failed');
      setClaritySummary(typeof data.summary === 'string' ? data.summary : '');
      if (typeof data.suggestedName === 'string' && data.suggestedName) {
        setClarifyName(
          String(data.suggestedName)
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 24),
        );
      }
      const qs = Array.isArray(data.questions) ? data.questions : [];
      const parsed: ClarifyQ[] = qs
        .map((q: any, i: number) => ({
          id: String(q.id || `q${i}`),
          question: String(q.question || ''),
          hint: q.hint ? String(q.hint) : undefined,
          suggestions: Array.isArray(q.suggestions)
            ? q.suggestions.map(String)
            : undefined,
          required: !!q.required,
          default: typeof q.default === 'string' ? q.default : undefined,
        }))
        .filter((q: ClarifyQ) => q.question);
      // Ensure a "theme" question is always present (default: Dark)
      if (!parsed.some((q) => q.id === 'theme')) {
        parsed.unshift({
          id: 'theme',
          question: 'Which theme would you like?',
          suggestions: ['Dark', 'Light', 'System'],
          default: 'Dark',
        });
      }
      setClarifyQuestions(parsed);
      // Pre-fill defaults
      const defaults: Record<string, string> = {};
      for (const q of parsed) if (q.default) defaults[q.id] = q.default;
      setClarifyAnswers(defaults);
      if (!qs.length)
        setClarifyError('AI returned no questions. You can build directly.');
    } catch (e) {
      setClarifyError(e instanceof Error ? e.message : 'Clarify failed');
    } finally {
      setClarifyLoading(false);
    }
  };

  const buildWithAnswers = () => {
    const answered = clarifyQuestions
      .map((q) => ({ q: q.question, a: (clarifyAnswers[q.id] || '').trim() }))
      .filter((x) => x.a);
    let enriched = prompt.trim();
    if (answered.length) {
      enriched +=
        '\n\nAdditional requirements (from clarification):\n' +
        answered.map((x) => `- ${x.q} → ${x.a}`).join('\n');
    }
    const notes = clarifyNotes.trim();
    if (notes) {
      enriched += '\n\nAdditional notes from user:\n' + notes;
    }
    setClarifyOpen(false);
    const name = clarifyName.trim();
    streamNDJSON(`${API_BASE}/api/apps/build`, {
      prompt: enriched,
      ...(name ? { name } : {}),
      ...(selectedBuildNode ? { node: selectedBuildNode } : {}),
    });
  };

  const skipClarifyAndBuild = () => {
    setClarifyOpen(false);
    startBuild();
  };
  const startRebuild = (text: string) => {
    if (!text.trim() || building || !selectedApp) return;
    streamNDJSON(`${API_BASE}/api/apps/${selectedApp}/rebuild`, {
      changes: text.trim(),
      node: selectedBuildNode || undefined,
    });
  };
  const startFix = (description?: string) => {
    if (building || !selectedApp) return;
    streamNDJSON(`${API_BASE}/api/apps/${selectedApp}/fix`, {
      description: description?.trim() || '',
      node: selectedBuildNode || undefined,
    });
  };
  const deleteApp = async (name: string) => {
    await fetch(`${API_BASE}/api/apps/${name}`, { method: 'DELETE' });
    if (selectedApp === name) setSelectedApp(null);
    refresh();
  };
  const stopApp = async (name: string) => {
    await fetch(`${API_BASE}/api/apps/${name}/stop`, { method: 'POST' });
    refresh();
  };
  const restartApp = async (name: string) => {
    try {
      const r = await fetch(`${API_BASE}/api/apps/${name}/restart`, {
        method: 'POST',
      });
      if (!r.ok) {
        // Fall back to a full deploy if quick restart fails (e.g. image missing).
        await fetch(`${API_BASE}/api/apps/${name}/deploy`, { method: 'POST' });
      }
    } catch {
      /* ignore */
    }
    refresh();
  };

  const toggleDev = async () => {
    if (!selectedApp || !app) return;
    if (app.dev_mode) {
      await fetch(`${API_BASE}/api/apps/${selectedApp}/dev/stop`, {
        method: 'POST',
      });
      refresh();
    } else {
      streamNDJSON(`${API_BASE}/api/apps/${selectedApp}/dev/start`, {});
    }
  };

  const saveFile = async () => {
    if (!selectedApp || !selectedFile) return;
    setFileSaving(true);
    try {
      await fetch(`${API_BASE}/api/apps/${selectedApp}/files/${selectedFile}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: fileContent }),
      });
      setFileDirty(false);
      // Visible feedback (esp. important since hot reload happens silently).
      setSaveToast(
        app?.dev_mode
          ? `Saved ${selectedFile} · vite watch will rebuild & reload the page`
          : `Saved ${selectedFile}`,
      );
      setTimeout(() => setSaveToast(null), 3500);
    } catch {
      setSaveToast(`Save failed`);
      setTimeout(() => setSaveToast(null), 3500);
    }
    setFileSaving(false);
  };

  const commitChanges = async () => {
    if (!selectedApp || committing) return;
    const msg =
      window.prompt(
        'Commit message:',
        `manual: edited ${selectedFile || 'files'}`,
      ) || '';
    if (!msg.trim()) return;
    setCommitting(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/apps/${selectedApp}/git/commit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg.trim() }),
        },
      );
      const data = await res.json();
      if (data.sha) {
        setSaveToast(`Committed ${data.sha} · ${msg.trim()}`);
        loadCommits?.();
      } else {
        setSaveToast('Nothing to commit');
      }
      setTimeout(() => setSaveToast(null), 4000);
    } catch {
      setSaveToast('Commit failed');
      setTimeout(() => setSaveToast(null), 3500);
    }
    setCommitting(false);
  };

  const deployApp = async () => {
    if (!selectedApp) return;
    setDeploying(true);
    setDeployEvents([]);
    try {
      const res = await fetch(`${API_BASE}/api/apps/${selectedApp}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok || !res.body) {
        setDeployEvents([{ step: 'error', message: 'Deploy failed' }]);
        setDeploying(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.trim()) {
            try {
              setDeployEvents((prev) => [...prev, JSON.parse(line)]);
            } catch {
              /* ignore */
            }
          }
        }
      }
    } catch (e) {
      setDeployEvents((prev) => [
        ...prev,
        { step: 'error', message: e instanceof Error ? e.message : 'Failed' },
      ]);
    }
    setDeploying(false);
    refresh();
  };

  // Chat — code assistant using dedicated app endpoint
  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading || !selectedApp) return;
    const userMsg: ChatMessage = { role: 'user', content: chatInput.trim() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/apps/${selectedApp}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatMessages
            .map((m) => ({ role: m.role, content: m.content }))
            .concat({ role: 'user', content: userMsg.content }),
          currentFile: selectedFile || '',
        }),
      });
      const data = await res.json();
      const reply =
        data.response || data.content || data.message || 'No response';
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Failed to get response.' },
      ]);
    }
    setChatLoading(false);
  };

  // Extract file blocks from chat message: ### FILE: path + ```code```
  const extractFileBlocks = (msg: string): { path: string; code: string }[] => {
    const blocks: { path: string; code: string }[] = [];
    const regex = /### FILE:\s*(\S+)\s*\n```[\w]*\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(msg)) !== null) {
      blocks.push({ path: match[1], code: match[2].trim() });
    }
    // Fallback: single code block without ### FILE: header
    if (blocks.length === 0) {
      const simple = msg.match(/```[\w]*\n([\s\S]*?)```/);
      if (simple)
        blocks.push({ path: selectedFile || '', code: simple[1].trim() });
    }
    return blocks;
  };

  const applyFileBlock = async (path: string, code: string) => {
    if (!selectedApp) return;
    // If it's the current file, apply in editor
    if (path === selectedFile) {
      setFileContent(code);
      setFileDirty(true);
      return;
    }
    // Otherwise save directly via API
    try {
      await fetch(`${API_BASE}/api/apps/${selectedApp}/files/${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: code }),
      });
      loadFiles();
    } catch {
      /* ignore */
    }
  };

  const app = apps.find((a) => a.name === selectedApp);
  const ext = selectedFile?.split('.').pop() || '';

  // Build file tree
  const tree = useMemo(() => buildTree(files), [files]);
  const toggleDir = (path: string) =>
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  // Auto-switch to build tab when building
  useEffect(() => {
    if (building) setRightTab('info');
  }, [building]);

  return {
    actionType,
    app,
    appLogs,
    appLogsLoading,
    appLogsRef,
    applyFileBlock,
    apps,
    bottomSplit,
    bottomSplitTab,
    bottomState,
    bottomTab,
    buildWithAnswers,
    building,
    cancelBuild,
    changeInput,
    chatInput,
    chatInputRef,
    chatLoading,
    chatMessages,
    chatRef,
    clarifyAnswers,
    clarifyError,
    clarifyLoading,
    clarifyName,
    clarifyNotes,
    clarifyOpen,
    clarifyQuestions,
    claritySummary,
    commitChanges,
    commits,
    committing,
    containerStats,
    deleteApp,
    deployApp,
    deployEvents,
    deploying,
    diffLayout,
    diffMode,
    diffSha,
    diffText,
    doSearch,
    editIcon,
    editRoute,
    events,
    expandedDirs,
    ext,
    extractFileBlocks,
    fileContent,
    fileDirty,
    fileLoading,
    fileSaving,
    fileSearch,
    files,
    gitOpen,
    loadCommits,
    logRef,
    mentionIndex,
    mentionOpen,
    mentionQuery,
    openClarify,
    prompt,
    restartApp,
    rightTab,
    runTermCmd,
    saveFile,
    saveSettings,
    saveToast,
    searchResults,
    searching,
    selectedApp,
    selectedBuildNode,
    selectedFile,
    sendChat,
    setActionType,
    setAppLogs,
    setAppLogsLoading,
    setBottomSplit,
    setBottomSplitTab,
    setBottomState,
    setBottomTab,
    setChangeInput,
    setChatInput,
    setChatMessages,
    setClarifyAnswers,
    setClarifyName,
    setClarifyNotes,
    setClarifyOpen,
    setDiffLayout,
    setDiffMode,
    setDiffSha,
    setEditIcon,
    setEditRoute,
    setFileContent,
    setFileDirty,
    setFileSearch,
    setGitOpen,
    setMentionIndex,
    setMentionOpen,
    setMentionQuery,
    setPrompt,
    setRightTab,
    setSearchResults,
    setSelectedApp,
    setSelectedBuildNode,
    setSelectedFile,
    setSettingsOpen,
    setTermCmd,
    setTermHistory,
    settingsOpen,
    skipClarifyAndBuild,
    startFix,
    startRebuild,
    stopApp,
    termCmd,
    termHistory,
    termRef,
    termRunning,
    toggleDev,
    toggleDir,
    tree,
    workerNodes,
  };
}
