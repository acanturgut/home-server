import './index.css';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  LayoutDashboard,
  MessageSquare,
  Blocks,
  Settings,
  Hexagon,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Sparkles,
  Wrench,
  Bug,
  Circle,
  Package,
  Download,
  Power,
  RefreshCw,
  X,
  Activity,
  Cpu,
  Search,
  Play,
  History,
  Columns2,
  ListTree,
  Square,
  Copy,
  GitBranch,
  Pencil,
  Pin,
  Star,
  Archive,
  Mic,
  Volume2,
  Trash2,
  Send,
  Plus,
  Clock,
  Globe,
  PanelLeft,
  Rows3,
  Undo2,
  Rocket,
  Zap,
} from 'lucide-react';
import { API_BASE } from '@/lib/api';
import {
  gotoPage,
  copyToClipboard,
  relTime,
  formatUptime,
} from '@/lib/format';
import { useSpeechRecognition, speak, stopSpeaking } from '@/lib/voice';
import { SLASH_COMMANDS } from '@/lib/slash';
import { MarkdownView, CompareBlock } from '@/lib/markdown';
import { DashboardPanel } from '@/panels/DashboardPanel';
import { NodesPanel } from '@/panels/NodesPanel';
import { LogsPanel } from '@/panels/LogsPanel';
import { HomeKitPanel } from '@/panels/HomeKitPanel';
import { EndpointCard } from '@/components/EndpointCard';
import { ClarifyWizard } from '@/components/ClarifyWizard';
import { AppSidebar } from '@/components/AppSidebar';
import { DiffView } from '@/components/DiffView';
import { EventLog } from '@/components/build/BuildPanel';
import {
  CodeEditor,
  FileTreeNode,
  buildTree,
  type AppFile,
} from '@/components/CodeEditor';
import { BottomPanel } from '@/components/BottomPanel';
import { SearchPalette } from '@/components/SearchPalette';
import { SchedulesModal } from '@/components/SchedulesModal';
import { PersonaQuickAdd } from '@/components/PersonaQuickAdd';
import {
  SettingsCard,
  SkeletonRows,
  InfoRow,
  ToggleRow,
  NumberRow,
} from '@/components/settings/SettingsRows';
import { PromptsEditor } from '@/components/settings/PromptsEditor';
import {
  NodeFormInline,
  type NodeConfig,
} from '@/components/settings/NodeFormInline';
import {
  BUILTIN_PERSONAS,
  DEFAULT_SYSTEM_PROMPT,
  type ChatAttachment,
  type ChatMsg,
  type ChatSession,
  type Persona,
} from '@/lib/chat';
import { guessIcon } from '@/lib/icons';
import type { SystemInfo, AppInfo, BuildEvent } from '@/lib/types';
import { ENDPOINTS } from '@/lib/endpoints';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/* ── System Dashboard ── */

/* ── Apps Panel ── */

/* ═══════════════════════════════════════════════════════════════
   AppsPanel — IDE-style layout with chat
   ┌─────────┬───────────────────────┬──────────────┐
   │ app bar │   code editor         │  build panel │
   │ + build │                       │  / app info  │
   │  input  │                       │              │
   └─────────┴────── event log ──────┴──────────────┘
   ═══════════════════════════════════════════════════════════════ */

function AppsPanel() {
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

  return (
    <div className="flex flex-col h-full">
      <div
        className={`flex min-h-0 overflow-hidden ${bottomState === 'expanded' ? 'flex-none h-0' : 'flex-1'}`}>
        {/* ── Left: App sidebar ── */}
        <AppSidebar
          apps={apps}
          selectedApp={selectedApp}
          setSelectedApp={setSelectedApp}
          building={building}
          openClarify={openClarify}
          cancelBuild={cancelBuild}
          setPrompt={setPrompt}
        />

        {/* ── Center: Code editor ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedApp ? (
            <>
              {/* Editor toolbar — flat */}
              <div className="flex items-center justify-between px-3 h-8 border-b border-border/10 shrink-0 overflow-hidden">
                <div className="flex items-center gap-1.5 min-w-0 flex-1 text-[11px]">
                  <span className="text-muted-foreground/40 shrink-0">
                    {selectedApp}
                  </span>
                  {selectedFile && (
                    <>
                      <span className="text-muted-foreground/20 shrink-0">
                        /
                      </span>
                      <span className="text-muted-foreground/60 truncate min-w-0">
                        {selectedFile}
                      </span>
                    </>
                  )}
                  {fileDirty && (
                    <span className="text-amber-400/80 shrink-0">
                      <Circle size={6} fill="currentColor" />
                    </span>
                  )}
                  {fileLoading && (
                    <span className="text-blue-400/60 text-[9px] animate-pulse shrink-0">
                      loading
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-0.5 text-[10px] shrink-0 ml-2">
                  {saveToast && (
                    <span className="px-2 py-0.5 text-[9px] text-emerald-300/80 bg-emerald-500/10 border border-emerald-500/20 rounded mr-1 truncate max-w-[260px]">
                      ✓ {saveToast}
                    </span>
                  )}
                  <button
                    onClick={saveFile}
                    disabled={!fileDirty || fileSaving}
                    title="Save the current file (⌘S). Hot reload will pick it up automatically."
                    className="px-2 py-0.5 text-muted-foreground/50 hover:text-foreground disabled:opacity-20 transition-colors">
                    {fileSaving ? '...' : 'Save'}
                  </button>
                  <span className="text-border/20">│</span>
                  <button
                    onClick={commitChanges}
                    disabled={committing}
                    title="git commit -am — snapshots all working-tree changes so they appear in Changes."
                    className="px-2 py-0.5 text-violet-300/70 hover:text-violet-300 disabled:opacity-30 transition-colors flex items-center gap-1">
                    <GitBranch size={10} /> {committing ? '...' : 'Commit'}
                  </button>
                  {app?.status === 'running' && (
                    <>
                      <span className="text-border/20">│</span>
                      <button
                        onClick={() =>
                          window.open(
                            `${API_BASE}/apps/${selectedApp}/`,
                            '_blank',
                          )
                        }
                        className="px-2 py-0.5 text-muted-foreground/50 hover:text-foreground transition-colors">
                        Open <ExternalLink size={10} className="inline" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-1 min-h-0">
                {/* File tree + search */}
                <div className="w-40 shrink-0 border-r border-border/10 flex flex-col overflow-hidden">
                  {/* Search */}
                  <div className="px-1.5 py-1 border-b border-border/5">
                    <div className="relative">
                      <Search
                        size={10}
                        className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/30"
                      />
                      <input
                        value={fileSearch}
                        onChange={(e) => setFileSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                        placeholder="Search files..."
                        className="w-full h-5 text-[9px] bg-transparent border border-border/10 rounded pl-5 pr-1 focus:outline-none focus:border-border/30 placeholder:text-muted-foreground/20"
                      />
                    </div>
                  </div>
                  {/* Search results or file tree */}
                  <div className="flex-1 overflow-auto py-1">
                    {searchResults.length > 0 ? (
                      <div className="space-y-0.5">
                        <button
                          onClick={() => {
                            setSearchResults([]);
                            setFileSearch('');
                          }}
                          className="w-full text-[8px] text-muted-foreground/30 hover:text-muted-foreground/60 px-2 py-0.5 text-left">
                          <X size={8} className="inline mr-0.5" /> Clear results
                          ({searchResults.length})
                        </button>
                        {searchResults.map((r, i) => (
                          <button
                            key={i}
                            onClick={() => setSelectedFile(r.file)}
                            className={`w-full text-left px-2 py-0.5 hover:bg-white/[0.03] transition-colors ${selectedFile === r.file ? 'bg-white/[0.04]' : ''}`}>
                            <div className="text-[9px] text-foreground/60 font-mono truncate">
                              {r.file}
                            </div>
                            <div className="text-[8px] text-muted-foreground/30 truncate">
                              L{r.line}: {r.text}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : searching ? (
                      <p className="text-[9px] text-muted-foreground/30 text-center py-2 animate-pulse">
                        Searching...
                      </p>
                    ) : (
                      <>
                        {tree.map((node) => (
                          <FileTreeNode
                            key={node.path}
                            node={node}
                            depth={0}
                            selectedFile={selectedFile}
                            onSelect={(path) => {
                              if (
                                !fileDirty ||
                                confirm('Discard unsaved changes?')
                              )
                                setSelectedFile(path);
                            }}
                            expanded={expandedDirs}
                            onToggle={toggleDir}
                          />
                        ))}
                        {files.length === 0 && (
                          <div className="p-4 text-center">
                            <p className="text-[10px] text-muted-foreground/30">
                              {building ? 'Generating...' : 'No files'}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Editor with syntax highlighting */}
                <div className="flex-1 min-w-0 min-h-0">
                  {selectedFile ? (
                    <CodeEditor
                      value={fileContent}
                      onChange={(code) => {
                        setFileContent(code);
                        setFileDirty(true);
                      }}
                      ext={ext}
                      onSave={saveFile}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground/20 text-xs bg-[#0d1117]">
                      Select a file
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4 max-w-xs">
                <p className="text-sm text-muted-foreground/30">
                  Select an app or build a new one
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      label: 'Todo App',
                      prompt:
                        'Build a modern todo app with categories, due dates, and drag-to-reorder',
                    },
                    {
                      label: 'Weather',
                      prompt:
                        'Build a weather dashboard that shows current weather and 5-day forecast for any city',
                    },
                    {
                      label: 'Notes',
                      prompt:
                        'Build a markdown notes app with sidebar, live preview, and local storage',
                    },
                    {
                      label: 'Pomodoro',
                      prompt:
                        'Build a pomodoro timer with session tracking, break reminders, and statistics',
                    },
                    {
                      label: 'Habit Tracker',
                      prompt:
                        'Build a daily habit tracker with streaks, calendar view, and progress charts',
                    },
                    {
                      label: 'Bookmarks',
                      prompt:
                        'Build a bookmark manager with tags, search, and card previews',
                    },
                  ].map((t) => (
                    <button
                      key={t.label}
                      onClick={() => {
                        setPrompt(t.prompt);
                      }}
                      className="px-3 py-2 text-[11px] text-muted-foreground/50 hover:text-foreground/70 bg-white/[0.02] hover:bg-white/[0.05] border border-border/10 rounded-lg transition-colors text-left">
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Tabbed panel ── */}
        <div className="w-72 shrink-0 border-l border-border/10 flex flex-col overflow-hidden">
          {/* Tab bar — settings + AI assistant */}
          <div className="flex h-8 border-b border-border/10 shrink-0">
            {(['info', 'chat'] as const).map((tab) => {
              const icons = { info: Blocks, chat: MessageSquare };
              const labels = { info: 'Settings', chat: 'AI Assistant' };
              const Icon = icons[tab];
              return (
                <button
                  key={tab}
                  onClick={() => setRightTab(tab)}
                  title={labels[tab]}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-[9px] uppercase tracking-wider transition-colors ${
                    rightTab === tab
                      ? 'text-foreground/70 border-b border-foreground/30'
                      : 'text-muted-foreground/30 hover:text-muted-foreground/60'
                  }`}>
                  <Icon size={11} />
                  {labels[tab]}
                  {tab === 'chat' && (building || deploying) && (
                    <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* ── Info tab ── */}
            {rightTab === 'info' && (
              <div className="flex-1 overflow-auto">
                {selectedApp && app ? (
                  <div className="p-3 space-y-3">
                    {/* ─── Hot reload status banner (top of panel) ─── */}
                    {app.dev_mode && (
                      <div
                        className={`px-2.5 py-2 rounded-lg border flex items-center gap-2 text-[11px] ${
                          app.dev_running
                            ? 'bg-amber-500/10 border-amber-500/25 text-amber-200'
                            : 'bg-red-500/10 border-red-500/30 text-red-200'
                        }`}>
                        {app.dev_running ? (
                          <Zap
                            size={12}
                            className="animate-pulse"
                            fill="currentColor"
                          />
                        ) : (
                          <Zap size={12} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">
                            {app.dev_running
                              ? '⚡ Hot reload active'
                              : '⚡ Hot mode ON · dev container is NOT running'}
                          </div>
                          <div className="text-[9px] opacity-70 truncate">
                            {app.dev_running
                              ? 'AI changes & Save apply via vite watch · page auto-reloads'
                              : 'Click Persist→Hot to revive, or Restart'}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ─── Live build/deploy events (right-panel, replaces bottom log) ─── */}
                    {(deploying || building || deployEvents.length > 0) && (
                      <div className="space-y-1">
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 flex items-center gap-1.5 px-1">
                          <Activity size={9} /> Live Events
                          {(deploying || building) && (
                            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          )}
                        </div>
                        <div
                          className={`p-2 rounded-lg max-h-48 overflow-auto border ${
                            deployEvents.some((e) => e.step === 'hot-reload')
                              ? 'bg-amber-500/5 border-amber-500/20'
                              : 'bg-white/[0.02] border-border/10'
                          }`}>
                          {deployEvents.length > 0 ? (
                            <EventLog events={deployEvents} />
                          ) : (
                            <div className="text-[10px] text-muted-foreground/40 italic">
                              Working…
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ─── Identity ─── */}
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02] border border-border/10">
                      <span className="text-2xl">
                        {app.icon || guessIcon(app.name)}
                      </span>
                      <div>
                        <h3 className="text-xs font-semibold">{app.name}</h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              app.status === 'running'
                                ? 'bg-emerald-500'
                                : app.status === 'building'
                                  ? 'bg-amber-500 animate-pulse'
                                  : app.status === 'failed'
                                    ? 'bg-red-500'
                                    : 'bg-zinc-500'
                            }`}
                          />
                          <span className="text-[10px] text-muted-foreground/60 capitalize">
                            {app.status}
                          </span>
                          <span className="text-[10px] text-muted-foreground/30">
                            :{app.port}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground/50 leading-relaxed px-1">
                      {app.prompt}
                    </p>

                    {app.error && (
                      <div className="p-2.5 bg-red-500/5 border border-red-500/15 rounded-lg">
                        <div className="text-[9px] uppercase tracking-wider text-red-400/60 mb-1 flex items-center gap-1.5">
                          <Bug size={9} /> Error
                        </div>
                        <p className="text-[10px] text-red-400/70 font-mono whitespace-pre-wrap">
                          {app.error}
                        </p>
                      </div>
                    )}

                    {/* ─── Resources ─── */}
                    <div className="space-y-1.5">
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 flex items-center gap-1.5 px-1">
                        <Activity size={9} /> Resources
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="p-2 bg-white/[0.02] rounded text-[10px]">
                          <span className="text-muted-foreground/40">
                            Files
                          </span>
                          <p className="text-foreground/60 mt-0.5">
                            {files.length}
                          </p>
                        </div>
                        <div className="p-2 bg-white/[0.02] rounded text-[10px]">
                          <span className="text-muted-foreground/40">
                            Route
                          </span>
                          <p className="text-foreground/60 mt-0.5 font-mono">
                            {app.route}
                          </p>
                        </div>
                        {containerStats && (
                          <>
                            <div className="p-2 bg-white/[0.02] rounded text-[10px]">
                              <span className="text-muted-foreground/40">
                                CPU
                              </span>
                              <p className="text-foreground/60 mt-0.5 font-mono">
                                {containerStats.cpu || '—'}
                              </p>
                            </div>
                            <div className="p-2 bg-white/[0.02] rounded text-[10px]">
                              <span className="text-muted-foreground/40">
                                Memory
                              </span>
                              <p className="text-foreground/60 mt-0.5 font-mono text-[9px]">
                                {containerStats.mem || '—'}
                              </p>
                            </div>
                            <div className="p-2 bg-white/[0.02] rounded text-[10px]">
                              <span className="text-muted-foreground/40">
                                Network
                              </span>
                              <p className="text-foreground/60 mt-0.5 font-mono text-[9px]">
                                {containerStats.net || '—'}
                              </p>
                            </div>
                            <div className="p-2 bg-white/[0.02] rounded text-[10px]">
                              <span className="text-muted-foreground/40">
                                PIDs
                              </span>
                              <p className="text-foreground/60 mt-0.5 font-mono">
                                {containerStats.pids || '—'}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* ─── Quick Actions ─── */}
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 flex items-center gap-1.5 px-1">
                        <Play size={9} /> Quick Actions
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {app.status === 'running' && (
                          <button
                            onClick={() =>
                              window.open(
                                `${API_BASE}/apps/${app.name}/`,
                                '_blank',
                              )
                            }
                            className="flex-1 min-w-0 py-1.5 text-[10px] text-emerald-400/80 bg-emerald-500/5 rounded hover:bg-emerald-500/10 transition-colors">
                            Open <ExternalLink size={10} className="inline" />
                          </button>
                        )}
                        <button
                          onClick={deployApp}
                          disabled={deploying || building}
                          title={
                            app?.dev_mode
                              ? 'Full Docker rebuild + redeploy. (Hot reload normally avoids this — only use it for prod-style validation.)'
                              : 'Build the Docker image and restart the container.'
                          }
                          className="py-1.5 px-3 text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded hover:bg-emerald-500/15 disabled:opacity-30 transition-colors flex items-center gap-1">
                          <Rocket size={10} /> {deploying ? '...' : 'Deploy'}
                        </button>
                        <button
                          onClick={toggleDev}
                          disabled={building}
                          title={
                            app?.dev_mode
                              ? '⚡ Hot reload ON. Click to switch to a persistent (production-style) container.'
                              : '📦 Persistent container. Click to switch to ⚡ Hot reload (instant changes, vite watch).'
                          }
                          className={`py-1.5 px-3 text-[10px] rounded border transition-colors flex items-center gap-1 disabled:opacity-30 ${
                            app?.dev_mode
                              ? 'text-amber-300 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/15'
                              : 'text-muted-foreground/70 hover:text-foreground bg-white/[0.02] border-border/15 hover:bg-white/[0.04]'
                          }`}>
                          {app?.dev_mode ? (
                            <>
                              <Zap size={10} fill="currentColor" /> Hot
                            </>
                          ) : (
                            <>
                              <Package size={10} /> Persist
                            </>
                          )}
                        </button>
                        {app.status === 'running' && (
                          <button
                            onClick={() => stopApp(app.name)}
                            className="py-1.5 px-3 text-[10px] text-muted-foreground/50 hover:bg-white/[0.03] rounded transition-colors">
                            Stop
                          </button>
                        )}
                        {(app.status === 'running' ||
                          app.status === 'failed' ||
                          app.status === 'stopped') && (
                          <button
                            onClick={() => restartApp(app.name)}
                            title="Restart container (no rebuild)"
                            className="py-1.5 px-3 text-[10px] text-sky-400/70 hover:text-sky-300 bg-sky-500/5 hover:bg-sky-500/10 rounded transition-colors">
                            <RefreshCw size={10} className="inline mr-0.5" />{' '}
                            Restart
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm(`Delete ${app.name}?`))
                              deleteApp(app.name);
                          }}
                          className="py-1.5 px-3 text-[10px] text-red-400/50 hover:text-red-400 hover:bg-red-500/5 rounded transition-colors">
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Build History */}
                    {app.builds && app.builds.length > 0 && (
                      <div className="pt-1 space-y-1.5">
                        <button
                          onClick={() => setSettingsOpen((v) => !v)}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/60 w-full">
                          <History size={10} /> Build History (
                          {app.builds.length})
                        </button>
                        <div className="space-y-1 max-h-40 overflow-auto">
                          {[...app.builds].reverse().map((b, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 text-[9px] py-0.5">
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}
                              />
                              <span className="text-muted-foreground/50 capitalize">
                                {b.action}
                              </span>
                              <span className="text-muted-foreground/30 flex-1 truncate font-mono">
                                {b.prompt}
                              </span>
                              <span className="text-muted-foreground/30 tabular-nums shrink-0">
                                {b.duration}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Git change log (per-app local repo) */}
                    {commits.length > 0 && (
                      <div className="pt-3 border-t border-border/10 space-y-1.5">
                        <button
                          onClick={() => setGitOpen((v) => !v)}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/60 w-full">
                          <GitBranch size={10} /> Changes ({commits.length})
                          <span className="ml-auto text-muted-foreground/30">
                            {gitOpen ? '−' : '+'}
                          </span>
                        </button>
                        {gitOpen && (
                          <div className="space-y-1 max-h-60 overflow-auto">
                            {commits.map((c) => (
                              <div
                                key={c.sha}
                                className="group w-full flex items-center gap-2 text-[10px] py-1 px-1.5 rounded hover:bg-white/[0.03] transition-colors">
                                <button
                                  onClick={() => setDiffSha(c.sha)}
                                  className="flex-1 min-w-0 flex items-center gap-2 text-left">
                                  <span className="font-mono text-muted-foreground/40 shrink-0">
                                    {c.short_sha}
                                  </span>
                                  {c.action && (
                                    <span
                                      className={`text-[9px] uppercase shrink-0 ${
                                        c.action === 'fix'
                                          ? 'text-amber-400/70'
                                          : c.action === 'rebuild'
                                            ? 'text-violet-400/70'
                                            : c.action === 'build'
                                              ? 'text-emerald-400/70'
                                              : c.action === 'revert'
                                                ? 'text-red-400/70'
                                                : 'text-muted-foreground/50'
                                      }`}>
                                      {c.action}
                                    </span>
                                  )}
                                  <span className="text-foreground/70 flex-1 truncate">
                                    {c.subject.replace(
                                      /^(build|fix|rebuild|deploy|revert):\s*/,
                                      '',
                                    )}
                                  </span>
                                  {c.files ? (
                                    <span className="text-muted-foreground/40 tabular-nums shrink-0">
                                      {c.files}f
                                    </span>
                                  ) : null}
                                  <span className="text-muted-foreground/30 tabular-nums shrink-0">
                                    {new Date(c.timestamp).toLocaleDateString(
                                      undefined,
                                      { month: 'short', day: 'numeric' },
                                    )}
                                  </span>
                                </button>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <button
                                    title="Revert this change (creates a new commit)"
                                    onClick={async () => {
                                      if (!selectedApp) return;
                                      if (
                                        !confirm(
                                          `Revert ${c.short_sha}?\n\n"${c.subject}"\n\nThis creates a new commit that undoes the change. You can deploy after to apply it.`,
                                        )
                                      )
                                        return;
                                      try {
                                        const res = await fetch(
                                          `${API_BASE}/api/apps/${selectedApp}/git/revert/${c.sha}`,
                                          { method: 'POST' },
                                        );
                                        const data = await res.json();
                                        if (!res.ok) {
                                          alert(
                                            'Revert failed: ' +
                                              (data.error || 'unknown'),
                                          );
                                          return;
                                        }
                                        loadCommits();
                                      } catch (e) {
                                        alert(
                                          'Revert failed: ' +
                                            (e instanceof Error
                                              ? e.message
                                              : 'unknown'),
                                        );
                                      }
                                    }}
                                    className="p-1 rounded hover:bg-red-500/15 text-red-400/70 hover:text-red-300">
                                    <Undo2 size={10} />
                                  </button>
                                  <button
                                    title="Deploy current files (rebuild Docker image)"
                                    onClick={() => deployApp()}
                                    disabled={deploying}
                                    className="p-1 rounded hover:bg-emerald-500/15 text-emerald-400/70 hover:text-emerald-300 disabled:opacity-30">
                                    <Rocket size={10} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Settings */}
                    <div className="pt-3 border-t border-border/10 space-y-2">
                      <button
                        onClick={() => {
                          setSettingsOpen((v) => !v);
                          setEditIcon(app.icon || '');
                          setEditRoute(app.route || '');
                        }}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/60">
                        <Settings size={10} /> Settings
                      </button>
                      {settingsOpen && (
                        <div className="space-y-2 p-2 bg-white/[0.02] rounded">
                          <div className="space-y-0.5">
                            <span className="text-[9px] text-muted-foreground/30">
                              Icon
                            </span>
                            <input
                              value={editIcon}
                              onChange={(e) => setEditIcon(e.target.value)}
                              placeholder="emoji..."
                              className="w-full h-6 text-[11px] bg-transparent border border-border/15 rounded px-2 focus:outline-none focus:border-foreground/20"
                            />
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[9px] text-muted-foreground/30">
                              Route
                            </span>
                            <input
                              value={editRoute}
                              onChange={(e) => setEditRoute(e.target.value)}
                              className="w-full h-6 text-[11px] font-mono bg-transparent border border-border/15 rounded px-2 focus:outline-none focus:border-foreground/20"
                            />
                          </div>
                          <button
                            onClick={saveSettings}
                            className="w-full py-1 text-[10px] text-foreground/60 bg-foreground/5 hover:bg-foreground/10 rounded transition-colors">
                            Save Settings
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Git diff modal */}
                    {diffSha && (
                      <div
                        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setDiffSha(null)}>
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="w-full max-w-6xl h-[85vh] bg-[#0a0a0a] border border-white/10 rounded-lg shadow-2xl flex flex-col">
                          <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10">
                            <GitBranch
                              size={12}
                              className="text-violet-400/70"
                            />
                            <span className="text-[11px] font-mono text-foreground/80">
                              {diffSha.slice(0, 12)}
                            </span>
                            <span className="text-[11px] text-muted-foreground/60 truncate flex-1">
                              {commits.find((c) => c.sha === diffSha)
                                ?.subject || ''}
                            </span>
                            <div className="flex items-center bg-white/5 rounded text-[10px] overflow-hidden">
                              <button
                                onClick={() => setDiffLayout('single')}
                                title="One file at a time (sidebar)"
                                className={`px-2 py-1 ${diffLayout === 'single' ? 'bg-violet-500/20 text-violet-200' : 'text-muted-foreground/50 hover:text-foreground'}`}>
                                <PanelLeft
                                  size={11}
                                  className="inline mr-0.5"
                                />{' '}
                                Files
                              </button>
                              <button
                                onClick={() => setDiffLayout('all')}
                                title="Scroll all files"
                                className={`px-2 py-1 ${diffLayout === 'all' ? 'bg-violet-500/20 text-violet-200' : 'text-muted-foreground/50 hover:text-foreground'}`}>
                                <Rows3 size={11} className="inline mr-0.5" />{' '}
                                All
                              </button>
                            </div>
                            <div className="flex items-center bg-white/5 rounded text-[10px] overflow-hidden">
                              <button
                                onClick={() => setDiffMode('split')}
                                className={`px-2 py-1 ${diffMode === 'split' ? 'bg-violet-500/20 text-violet-200' : 'text-muted-foreground/50 hover:text-foreground'}`}>
                                <Columns2 size={11} className="inline mr-0.5" />{' '}
                                Split
                              </button>
                              <button
                                onClick={() => setDiffMode('unified')}
                                className={`px-2 py-1 ${diffMode === 'unified' ? 'bg-violet-500/20 text-violet-200' : 'text-muted-foreground/50 hover:text-foreground'}`}>
                                <ListTree size={11} className="inline mr-0.5" />{' '}
                                Unified
                              </button>
                            </div>
                            <button
                              onClick={() => setDiffSha(null)}
                              className="p-1 text-muted-foreground/50 hover:text-foreground rounded hover:bg-white/5">
                              <X size={12} />
                            </button>
                          </div>
                          <div className="flex-1 p-3 min-h-0 overflow-hidden">
                            {diffText === 'Loading…' ? (
                              <div className="text-[11px] text-muted-foreground/60">
                                Loading…
                              </div>
                            ) : (
                              <DiffView
                                diff={diffText}
                                mode={diffMode}
                                layout={diffLayout}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center h-full">
                    <p className="text-[10px] text-muted-foreground/20">
                      No app selected
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── AI Assistant tab (Make Changes + Chat) ── */}
            {rightTab === 'chat' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* ─── Make Changes (top of AI tab) ─── */}
                <div className="p-2.5 border-b border-border/10 space-y-2">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 flex items-center gap-1.5">
                    <Sparkles size={9} /> Make Changes
                  </div>
                  {/* Compute-node picker */}
                  <div className="flex items-center gap-1.5">
                    <Cpu
                      size={9}
                      className="text-muted-foreground/40 shrink-0"
                    />
                    <select
                      value={selectedBuildNode}
                      onChange={(e) => setSelectedBuildNode(e.target.value)}
                      disabled={building}
                      title="Compute node to run this task"
                      className="flex-1 bg-transparent border border-border/15 rounded text-[10px] py-1 px-1.5 focus:outline-none focus:border-violet-500/40 disabled:opacity-30">
                      <option value="">Auto (best available)</option>
                      {workerNodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                          {n.tier ? ` · ${n.tier}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setActionType('feature')}
                      className={`flex-1 py-1 text-[9px] rounded transition-colors ${
                        actionType === 'feature'
                          ? 'text-violet-400 bg-violet-500/10 border border-violet-500/20'
                          : 'text-muted-foreground/40 hover:bg-white/[0.03] border border-transparent'
                      }`}>
                      <Sparkles size={10} className="inline mr-0.5" /> Feature
                    </button>
                    <button
                      onClick={() => setActionType('fix')}
                      className={`flex-1 py-1 text-[9px] rounded transition-colors ${
                        actionType === 'fix'
                          ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
                          : 'text-muted-foreground/40 hover:bg-white/[0.03] border border-transparent'
                      }`}>
                      <Wrench size={10} className="inline mr-0.5" /> Fix
                    </button>
                    <button
                      onClick={() => setActionType('bug')}
                      className={`flex-1 py-1 text-[9px] rounded transition-colors ${
                        actionType === 'bug'
                          ? 'text-red-400 bg-red-500/10 border border-red-500/20'
                          : 'text-muted-foreground/40 hover:bg-white/[0.03] border border-transparent'
                      }`}>
                      <Bug size={10} className="inline mr-0.5" /> Bug
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={changeInput}
                      onChange={(e) => setChangeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && changeInput.trim()) {
                          if (actionType === 'feature')
                            startRebuild(changeInput);
                          else startFix(changeInput);
                          setChangeInput('');
                        }
                      }}
                      placeholder={
                        actionType === 'feature'
                          ? 'Add a feature... (e.g. dark mode, undo button)'
                          : actionType === 'fix'
                            ? 'Describe what to fix...'
                            : 'Describe the bug...'
                      }
                      disabled={building}
                      className="w-full bg-transparent border border-border/15 rounded text-[11px] py-1.5 px-2.5 pr-12 focus:outline-none focus:border-violet-500/40 placeholder:text-muted-foreground/20 transition-colors disabled:opacity-30"
                    />
                    <button
                      onClick={() => {
                        if (actionType === 'feature') startRebuild(changeInput);
                        else startFix(changeInput);
                        setChangeInput('');
                      }}
                      disabled={building || !changeInput.trim()}
                      className={`absolute right-1 top-1/2 -translate-y-1/2 text-[9px] px-2 py-0.5 rounded disabled:opacity-20 transition-colors ${
                        actionType === 'feature'
                          ? 'text-violet-400/60 hover:text-violet-400 bg-violet-500/5'
                          : actionType === 'fix'
                            ? 'text-amber-400/60 hover:text-amber-400 bg-amber-500/5'
                            : 'text-red-400/60 hover:text-red-400 bg-red-500/5'
                      }`}>
                      {actionType === 'feature' ? 'Add' : 'Fix'}
                    </button>
                  </div>
                  {actionType !== 'feature' && (
                    <button
                      onClick={() => startFix()}
                      disabled={building}
                      className="w-full py-1.5 text-[10px] text-amber-400/80 bg-amber-500/5 border border-amber-500/10 rounded hover:bg-amber-500/10 transition-colors disabled:opacity-30">
                      <Wrench size={10} className="inline mr-0.5" /> Auto-fix
                      from Logs
                    </button>
                  )}
                </div>

                {/* ─── Chat header ─── */}
                <div className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-wider text-muted-foreground/40 flex items-center gap-1.5">
                  <MessageSquare size={9} /> Chat with code assistant
                </div>

                {/* Messages */}
                <div
                  ref={chatRef}
                  className="flex-1 overflow-auto p-3 space-y-3">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-[10px] text-muted-foreground/25">
                        Code Assistant
                      </p>
                      <p className="text-[9px] text-muted-foreground/15 mt-1">
                        Has access to all {files.length} files in{' '}
                        {selectedApp || 'app'}
                      </p>
                      <p className="text-[9px] text-muted-foreground/30 mt-2">
                        Type{' '}
                        <span className="text-blue-400/70 font-mono">@</span> to
                        mention a file ·{' '}
                        <span className="text-amber-400/70 font-mono">
                          @app
                        </span>{' '}
                        = all files
                      </p>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => {
                    const isUser = msg.role === 'user';
                    const fileBlocks = !isUser
                      ? extractFileBlocks(msg.content)
                      : [];
                    // Remove file blocks from display text
                    let textContent = msg.content;
                    if (!isUser && fileBlocks.length > 0) {
                      textContent = textContent
                        .replace(
                          /### FILE:\s*\S+\s*\n```[\w]*\n[\s\S]*?```/g,
                          '',
                        )
                        .replace(/```[\w]*\n[\s\S]*?```/g, '')
                        .trim();
                    }
                    return (
                      <div key={i} className={`${isUser ? 'ml-6' : 'mr-2'}`}>
                        <div
                          className={`rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
                            isUser
                              ? 'bg-blue-500/10 text-blue-200/80 ml-auto'
                              : 'bg-white/3 text-muted-foreground/70'
                          }`}>
                          {textContent && (
                            <p className="whitespace-pre-wrap">{textContent}</p>
                          )}
                          {fileBlocks.map((fb, j) => (
                            <div key={j} className="mt-2">
                              {fb.path && (
                                <div className="text-[9px] text-muted-foreground/40 font-mono mb-1">
                                  {fb.path}
                                </div>
                              )}
                              <div className="bg-black/30 rounded p-2 overflow-auto max-h-48">
                                <pre className="text-[10px] font-mono text-gray-300/80 whitespace-pre-wrap">
                                  {fb.code.length > 500
                                    ? fb.code.slice(0, 500) + '\n...'
                                    : fb.code}
                                </pre>
                              </div>
                              <button
                                onClick={() => applyFileBlock(fb.path, fb.code)}
                                className="mt-1.5 text-[10px] text-emerald-400/70 hover:text-emerald-300 bg-emerald-500/5 px-2.5 py-1 rounded transition-colors">
                                Apply{' '}
                                {fb.path === selectedFile
                                  ? 'to editor'
                                  : `to ${fb.path}`}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {chatLoading && (
                    <div className="mr-2">
                      <div className="bg-white/3 rounded-lg px-3 py-2 text-[11px] text-muted-foreground/40 animate-pulse">
                        Thinking...
                      </div>
                    </div>
                  )}
                </div>

                {/* Chat input */}
                <div className="p-2.5 border-t border-border/10">
                  {selectedFile && (
                    <div className="text-[9px] text-muted-foreground/20 mb-1 font-mono truncate">
                      context: {selectedFile}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      {(() => {
                        // Compute the matching mention list (files + @app)
                        const opts: { value: string; desc: string }[] =
                          mentionOpen
                            ? [
                                {
                                  value: 'app',
                                  desc: `all ${files.length} files`,
                                },
                                ...files
                                  .map((f) => f.path)
                                  .filter((p) =>
                                    p
                                      .toLowerCase()
                                      .includes(mentionQuery.toLowerCase()),
                                  )
                                  .slice(0, 12)
                                  .map((p) => ({ value: p, desc: '' })),
                              ].filter((o) =>
                                mentionQuery
                                  ? o.value
                                      .toLowerCase()
                                      .includes(mentionQuery.toLowerCase()) ||
                                    o.value === 'app'
                                  : true,
                              )
                            : [];
                        const insertMention = (val: string) => {
                          // Replace the last "@<query>" with "@val "
                          const re = /@[\w./-]*$/;
                          const next = chatInput.replace(re, '@' + val + ' ');
                          setChatInput(next);
                          setMentionOpen(false);
                          setMentionQuery('');
                          setMentionIndex(0);
                          // Refocus input
                          requestAnimationFrame(() =>
                            chatInputRef.current?.focus(),
                          );
                        };
                        return (
                          <>
                            <input
                              ref={chatInputRef}
                              type="text"
                              value={chatInput}
                              onChange={(e) => {
                                const v = e.target.value;
                                setChatInput(v);
                                // Detect "@..." at the end (or before a space)
                                const m = v
                                  .slice(0, e.target.selectionStart || v.length)
                                  .match(/@([\w./-]*)$/);
                                if (m) {
                                  setMentionQuery(m[1]);
                                  setMentionOpen(true);
                                  setMentionIndex(0);
                                } else {
                                  setMentionOpen(false);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (mentionOpen && opts.length > 0) {
                                  if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    setMentionIndex(
                                      (i) => (i + 1) % opts.length,
                                    );
                                    return;
                                  }
                                  if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    setMentionIndex(
                                      (i) =>
                                        (i - 1 + opts.length) % opts.length,
                                    );
                                    return;
                                  }
                                  if (
                                    e.key === 'Tab' ||
                                    (e.key === 'Enter' && mentionOpen)
                                  ) {
                                    e.preventDefault();
                                    insertMention(opts[mentionIndex].value);
                                    return;
                                  }
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setMentionOpen(false);
                                    return;
                                  }
                                }
                                if (e.key === 'Enter') sendChat();
                              }}
                              placeholder="Ask about the code… type @ to mention files"
                              disabled={chatLoading}
                              className="w-full bg-transparent border-0 border-b border-border/15 text-xs py-1.5 pr-6 focus:outline-none focus:border-blue-500/30 placeholder:text-muted-foreground/25 transition-colors"
                            />
                            {mentionOpen && opts.length > 0 && (
                              <div className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-auto bg-[#0a0a0a] border border-white/10 rounded-lg shadow-xl z-30">
                                {opts.map((o, i) => (
                                  <button
                                    key={o.value + i}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      insertMention(o.value);
                                    }}
                                    onMouseEnter={() => setMentionIndex(i)}
                                    className={`w-full text-left px-2 py-1 text-[11px] flex items-center gap-2 ${
                                      i === mentionIndex
                                        ? 'bg-blue-500/15 text-foreground'
                                        : 'text-foreground/70 hover:bg-white/[0.04]'
                                    }`}>
                                    <span
                                      className={
                                        o.value === 'app'
                                          ? 'text-amber-400'
                                          : 'text-blue-400/70'
                                      }>
                                      @{o.value}
                                    </span>
                                    {o.desc && (
                                      <span className="text-[9px] text-muted-foreground/40 ml-auto">
                                        {o.desc}
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <button
                      onClick={sendChat}
                      disabled={chatLoading || !chatInput.trim()}
                      className="shrink-0 text-[10px] text-muted-foreground/30 hover:text-foreground disabled:opacity-20 transition-colors px-1">
                      ↑
                    </button>
                    {chatMessages.length > 0 && (
                      <button
                        onClick={() => setChatMessages([])}
                        className="shrink-0 text-[9px] text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors px-1">
                        clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom: Tabbed Events / Logs / Terminal panel ── */}
      <BottomPanel
        state={bottomState}
        setState={setBottomState}
        tab={bottomTab}
        setTab={setBottomTab}
        split={bottomSplit}
        setSplit={setBottomSplit}
        splitTab={bottomSplitTab}
        setSplitTab={setBottomSplitTab}
        events={events}
        logRef={logRef}
        selectedApp={selectedApp}
        appStatus={app?.status}
        appLogs={appLogs}
        appLogsLoading={appLogsLoading}
        appLogsRef={appLogsRef}
        onRefreshLogs={() => {
          if (!selectedApp) return;
          setAppLogsLoading(true);
          fetch(`${API_BASE}/api/apps/${selectedApp}/logs?tail=200`)
            .then((r) => r.json())
            .then((d) => setAppLogs(d.logs || ''))
            .catch(() => setAppLogs('Failed'))
            .finally(() => setAppLogsLoading(false));
        }}
        termCmd={termCmd}
        setTermCmd={setTermCmd}
        termHistory={termHistory}
        setTermHistory={setTermHistory}
        termRunning={termRunning}
        termRef={termRef}
        runTermCmd={runTermCmd}
      />

      {/* ── AI Clarify wizard ── */}
      {clarifyOpen && (
        <ClarifyWizard
          prompt={prompt}
          setPrompt={setPrompt}
          loading={clarifyLoading}
          error={clarifyError}
          summary={claritySummary}
          questions={clarifyQuestions}
          answers={clarifyAnswers}
          setAnswers={setClarifyAnswers}
          name={clarifyName}
          setName={setClarifyName}
          notes={clarifyNotes}
          setNotes={setClarifyNotes}
          onClose={() => setClarifyOpen(false)}
          onRegenerate={openClarify}
          onSkip={skipClarifyAndBuild}
          onBuild={buildWithAnswers}
        />
      )}
    </div>
  );
}

/* ── HomeKit Panel ── */

/* ── Chat Panel (Streaming with Sessions) ── */

function ChatPanel() {
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

function SettingsPanel() {
  const [tab, setTab] = useState<
    'general' | 'nodes' | 'homekit' | 'api' | 'prompts'
  >('general');
  const [routerModel, setRouterModel] = useState('');
  const [ollamaHost, setOllamaHost] = useState('');
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Extended config / system info
  type SystemConfig = {
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
  };
  const [sysCfg, setSysCfg] = useState<SystemConfig | null>(null);
  // Persisted runtime settings
  type RuntimeSettings = {
    autoFixOnCrash: boolean;
    defaultTemperature: number;
    buildTimeoutMin: number;
    keepBuildHistory: number;
  };
  const defaultSettings: RuntimeSettings = {
    autoFixOnCrash: false,
    defaultTemperature: 0.7,
    buildTimeoutMin: 30,
    keepBuildHistory: 20,
  };
  const [settings, setSettings] = useState<RuntimeSettings>(defaultSettings);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [nodes, setNodes] = useState<NodeConfig[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: '',
    host: '',
    tier: 'high-end',
    gpu: '',
    mac: '',
    model: '',
    temperature: 0.7,
  });
  const [models, setModels] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [promptsSaving, setPromptsSaving] = useState(false);
  const [promptsDirty, setPromptsDirty] = useState(false);

  const refreshPrompts = useCallback(() => {
    fetch(`${API_BASE}/api/prompts`)
      .then((r) => r.json())
      .then((d) => {
        setPrompts(d);
        setPromptsDirty(false);
      })
      .catch(() => {});
  }, []);

  const savePrompts = async () => {
    setPromptsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/prompts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prompts),
      });
      const d = await res.json();
      setPrompts(d);
      setPromptsDirty(false);
    } catch {}
    setPromptsSaving(false);
  };

  const resetPrompts = async () => {
    if (!confirm('Reset all prompts to defaults?')) return;
    setPromptsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/prompts/reset`, {
        method: 'POST',
      });
      const d = await res.json();
      setPrompts(d);
      setPromptsDirty(false);
    } catch {}
    setPromptsSaving(false);
  };

  const updatePrompt = (key: string, val: string) => {
    setPrompts((prev) => ({ ...prev, [key]: val }));
    setPromptsDirty(true);
  };

  const refresh = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      fetch(`${API_BASE}/api/config`).then((r) => r.json()),
      fetch(`${API_BASE}/api/health`).then((r) => r.json()),
    ])
      .then(([cfg, health]) => {
        setSysCfg(cfg as SystemConfig);
        setRouterModel(cfg.router_model || '');
        setOllamaHost(cfg.ollama_host || '');
        setOllamaOnline(health.backends?.ollama || false);
        setNodes((health.backends?.nodes || []).map((n: any) => ({ ...n })));
      })
      .catch((e) =>
        setLoadError(e instanceof Error ? e.message : 'Failed to load'),
      )
      .finally(() => setLoading(false));
  }, []);

  const refreshSettings = useCallback(() => {
    setSettingsLoading(true);
    fetch(`${API_BASE}/api/settings`)
      .then((r) => r.json())
      .then((d) => {
        setSettings({ ...defaultSettings, ...d });
        setSettingsDirty(false);
      })
      .catch(() => {})
      .finally(() => setSettingsLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    refreshSettings();
  }, [refresh, refreshSettings]);

  const updateSetting = <K extends keyof RuntimeSettings>(
    k: K,
    v: RuntimeSettings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [k]: v }));
    setSettingsDirty(true);
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const d = await res.json();
      setSettings({ ...defaultSettings, ...d });
      setSettingsDirty(false);
    } catch {
      // ignore
    }
    setSettingsSaving(false);
  };

  const resetSettings = async () => {
    if (!confirm('Reset all runtime settings to defaults?')) return;
    setSettingsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings/reset`, {
        method: 'POST',
      });
      const d = await res.json();
      setSettings({ ...defaultSettings, ...d });
      setSettingsDirty(false);
    } catch {
      // ignore
    }
    setSettingsSaving(false);
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ router_model: routerModel }),
      });
      const data = await res.json();
      setRouterModel(data.router_model);
    } catch {}
    setSaving(false);
  };

  const startEdit = (n: NodeConfig) => {
    setEditId(n.id);
    setForm({
      name: n.name,
      host: n.host,
      tier: n.tier,
      gpu: n.gpu || '',
      mac: n.mac || '',
      model: n.model || '',
      temperature: n.temperature ?? 0.7,
    });
    setModels([]);
    if (n.online) {
      fetch(`${API_BASE}/api/nodes/${n.id}/models`)
        .then((r) => r.json())
        .then((d) => setModels(d.models || []))
        .catch(() => {});
    }
  };

  const saveNode = async () => {
    if (!editId) return;
    await fetch(`${API_BASE}/api/nodes/${editId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setEditId(null);
    refresh();
  };

  const removeNode = async (id: string) => {
    if (!confirm('Remove this node?')) return;
    await fetch(`${API_BASE}/api/nodes/${id}`, { method: 'DELETE' });
    setEditId(null);
    refresh();
  };

  const addNode = async () => {
    if (!form.name || !form.host) return;
    await fetch(`${API_BASE}/api/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setShowAdd(false);
    setForm({
      name: '',
      host: '',
      tier: 'high-end',
      gpu: '',
      mac: '',
      model: '',
      temperature: settings.defaultTemperature,
    });
    refresh();
  };

  const wakeNode = async (id: string) => {
    await fetch(`${API_BASE}/api/nodes/${id}/wake`, { method: 'POST' });
  };

  const tabs = [
    { id: 'general' as const, label: 'General' },
    { id: 'nodes' as const, label: `Nodes (${nodes.length})` },
    { id: 'prompts' as const, label: 'Prompts' },
    { id: 'homekit' as const, label: 'HomeKit' },
    { id: 'api' as const, label: 'API' },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border/20 pb-px">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors ${
              tab === t.id
                ? 'text-foreground bg-muted/30 border-b-2 border-foreground/40'
                : 'text-muted-foreground hover:text-foreground'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── General Tab ── */}
      {tab === 'general' && (
        <div className="space-y-4">
          {/* Top action bar */}
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground/60">
              {loading
                ? 'Loading…'
                : sysCfg
                  ? `home-server ${sysCfg.version} · uptime ${formatUptime(sysCfg.uptime_seconds)}`
                  : 'Configuration'}
            </p>
            <button
              onClick={() => {
                refresh();
                refreshSettings();
              }}
              disabled={loading || settingsLoading}
              className="text-[10px] flex items-center gap-1 px-2 py-1 text-muted-foreground/50 hover:text-foreground/80 disabled:opacity-30 transition-colors">
              <RefreshCw
                size={10}
                className={loading || settingsLoading ? 'animate-spin' : ''}
              />
              Refresh
            </button>
          </div>

          {loadError && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-[11px] text-red-300">
              {loadError}
            </div>
          )}

          {/* ── System Info card ── */}
          <SettingsCard title="System" icon={<Hexagon size={12} />}>
            {loading || !sysCfg ? (
              <SkeletonRows rows={5} />
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                <InfoRow label="Version" value={sysCfg.version} />
                <InfoRow label="Port" value={sysCfg.port} mono />
                <InfoRow
                  label="Started"
                  value={new Date(sysCfg.started_at).toLocaleString()}
                />
                <InfoRow
                  label="Uptime"
                  value={formatUptime(sysCfg.uptime_seconds)}
                />
                <InfoRow label="Apps" value={String(sysCfg.apps_count)} />
                <InfoRow label="Nodes" value={String(sysCfg.nodes_count)} />
                <InfoRow label="Data dir" value={sysCfg.data_dir} mono full />
                <InfoRow label="Log dir" value={sysCfg.log_dir} mono full />
                <InfoRow label="HomeKit PIN" value={sysCfg.homekit_pin} mono />
                <InfoRow
                  label="Anthropic key"
                  value={sysCfg.anthropic_set ? 'configured' : 'not set'}
                  valueClass={
                    sysCfg.anthropic_set
                      ? 'text-emerald-400/80'
                      : 'text-muted-foreground/50'
                  }
                />
              </div>
            )}
          </SettingsCard>

          {/* ── Backends card ── */}
          <SettingsCard title="Backends" icon={<Activity size={12} />}>
            {loading ? (
              <SkeletonRows rows={2} />
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span
                    className={`w-2 h-2 rounded-full ${ollamaOnline ? 'bg-emerald-500' : 'bg-zinc-500'}`}
                  />
                  <span className="text-sm font-medium">Ollama</span>
                  <span className="text-[11px] text-muted-foreground">
                    {ollamaOnline ? 'Online' : 'Offline'}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50 ml-auto font-mono">
                    {ollamaHost}
                  </span>
                </div>
                <div className="space-y-1.5 pt-3 border-t border-border/10">
                  <label className="text-[11px] text-muted-foreground">
                    Router Model (Ollama classifier)
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={routerModel}
                      onChange={(e) => setRouterModel(e.target.value)}
                      placeholder="gemma3:1b"
                      className="h-7 text-xs flex-1 rounded-md border border-border/30 bg-transparent px-2 focus:outline-none focus:ring-1 focus:ring-ring/30"
                    />
                    <button
                      onClick={saveConfig}
                      disabled={saving}
                      className="h-7 px-3 rounded-md text-[11px] font-medium bg-foreground/10 hover:bg-foreground/15 disabled:opacity-50 transition-colors">
                      {saving ? '...' : 'Save'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </SettingsCard>

          {/* ── Build Defaults card ── */}
          <SettingsCard
            title="Build Defaults"
            icon={<Wrench size={12} />}
            actions={
              <>
                {settingsDirty && (
                  <span className="text-[9px] text-amber-400/80">unsaved</span>
                )}
                <button
                  onClick={resetSettings}
                  disabled={settingsSaving}
                  className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors">
                  Reset
                </button>
                <button
                  onClick={saveSettings}
                  disabled={!settingsDirty || settingsSaving}
                  className="text-[10px] px-2 py-0.5 rounded bg-foreground/10 hover:bg-foreground/15 disabled:opacity-30 transition-colors">
                  {settingsSaving ? '…' : 'Save'}
                </button>
              </>
            }>
            {settingsLoading ? (
              <SkeletonRows rows={5} />
            ) : (
              <div className="space-y-3">
                <ToggleRow
                  label="Auto-fix on crash"
                  hint="Automatically run /fix when a deployed app exits unexpectedly"
                  value={settings.autoFixOnCrash}
                  onChange={(v) => updateSetting('autoFixOnCrash', v)}
                />
                <NumberRow
                  label="Default temperature"
                  hint="Used as the LLM temperature default for new nodes (0.0–2.0)"
                  value={settings.defaultTemperature}
                  step={0.1}
                  min={0}
                  max={2}
                  onChange={(v) => updateSetting('defaultTemperature', v)}
                />
                <NumberRow
                  label="Build timeout"
                  hint="Hard cap on how long a single build pipeline run may take, in minutes"
                  value={settings.buildTimeoutMin}
                  step={1}
                  min={1}
                  max={240}
                  suffix="min"
                  onChange={(v) => updateSetting('buildTimeoutMin', v)}
                />
                <NumberRow
                  label="Keep build history"
                  hint="Number of past builds retained per app"
                  value={settings.keepBuildHistory}
                  step={1}
                  min={1}
                  max={200}
                  suffix="entries"
                  onChange={(v) => updateSetting('keepBuildHistory', v)}
                />
              </div>
            )}
          </SettingsCard>

          {/* ── About card ── */}
          <SettingsCard title="About" icon={<Blocks size={12} />}>
            <div className="space-y-2 text-[11px] text-muted-foreground/70">
              <p>
                <span className="text-foreground/80">home-server</span> — a
                self-hosted dashboard that turns natural-language prompts into
                running web apps on your Raspberry Pi.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <a
                  href="https://github.com/acanturgut/home-server"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-blue-400/80 hover:text-blue-300 inline-flex items-center gap-1">
                  <ExternalLink size={9} /> GitHub
                </a>
                <a
                  href={`${API_BASE}/api/health`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-blue-400/80 hover:text-blue-300 inline-flex items-center gap-1">
                  <ExternalLink size={9} /> /api/health
                </a>
                <a
                  href={`${API_BASE}/api/system`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-blue-400/80 hover:text-blue-300 inline-flex items-center gap-1">
                  <ExternalLink size={9} /> /api/system
                </a>
              </div>
            </div>
          </SettingsCard>
        </div>
      )}

      {/* ── Nodes Tab ── */}
      {tab === 'nodes' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {loading
                ? 'Loading nodes…'
                : `${nodes.length} node${nodes.length !== 1 ? 's' : ''} configured`}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={refresh}
                disabled={loading}
                className="text-[10px] flex items-center gap-1 px-2 py-1 text-muted-foreground/50 hover:text-foreground/80 disabled:opacity-30 transition-colors">
                <RefreshCw
                  size={10}
                  className={loading ? 'animate-spin' : ''}
                />
                Refresh
              </button>
              <button
                onClick={() => {
                  setShowAdd(!showAdd);
                  setEditId(null);
                  setForm({
                    name: '',
                    host: '',
                    tier: 'high-end',
                    gpu: '',
                    mac: '',
                    model: '',
                    temperature: settings.defaultTemperature,
                  });
                }}
                className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors">
                {showAdd ? (
                  <>
                    <X size={11} className="inline" /> Cancel
                  </>
                ) : (
                  '+ Add Node'
                )}
              </button>
            </div>
          </div>

          {loading && nodes.length === 0 && <SkeletonRows rows={3} block />}

          {showAdd && (
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
              <p className="text-[11px] font-medium text-foreground/70">
                New Node
              </p>
              <NodeFormInline form={form} setForm={setForm} models={models} />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowAdd(false)}
                  className="px-2.5 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
                <button
                  onClick={addNode}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-foreground/10 hover:bg-foreground/15 transition-colors">
                  Add
                </button>
              </div>
            </div>
          )}

          {nodes.map((n) => (
            <div
              key={n.id}
              className="rounded-lg border border-border/30 p-3 space-y-2">
              <div className="flex items-center gap-3">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${n.online ? 'bg-emerald-500' : 'bg-zinc-500'}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{n.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {n.tier}
                    </span>
                    {n.gpu && (
                      <span className="text-[10px] text-muted-foreground">
                        {n.gpu}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">
                    {n.host}
                    {n.model ? ` · ${n.model}` : ''}
                    {n.temperature != null ? ` · t=${n.temperature}` : ''}
                    {n.mac ? ` · ${n.mac}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {n.mac && (
                    <button
                      onClick={() => wakeNode(n.id)}
                      className="px-2 py-1 rounded text-[11px] text-violet-400 hover:bg-violet-500/10 transition-colors">
                      <Power size={13} />
                    </button>
                  )}
                  <button
                    onClick={() =>
                      editId === n.id ? setEditId(null) : startEdit(n)
                    }
                    className={`px-2 py-1 rounded text-[11px] transition-colors ${editId === n.id ? 'text-blue-300 bg-blue-500/10' : 'text-muted-foreground hover:text-foreground'}`}>
                    {editId === n.id ? 'Close' : 'Edit'}
                  </button>
                  <button
                    onClick={() => removeNode(n.id)}
                    className="px-2 py-1 rounded text-[11px] text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                    <X size={13} />
                  </button>
                </div>
              </div>
              {editId === n.id && (
                <div className="pt-2 border-t border-border/20 space-y-3">
                  <NodeFormInline
                    form={form}
                    setForm={setForm}
                    models={models}
                    nodeId={n.id}
                    online={n.online}
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditId(null)}
                      className="px-2.5 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={saveNode}
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-foreground/10 hover:bg-foreground/15 transition-colors">
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!loading && nodes.length === 0 && !showAdd && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No nodes configured
            </p>
          )}
        </div>
      )}

      {/* ── HomeKit Tab ── */}
      {tab === 'homekit' && <HomeKitPanel />}

      {/* ── Prompts Tab ── */}
      {tab === 'prompts' && (
        <PromptsEditor
          prompts={prompts}
          onLoad={refreshPrompts}
          onChange={updatePrompt}
          onSave={savePrompts}
          onReset={resetPrompts}
          saving={promptsSaving}
          dirty={promptsDirty}
        />
      )}

      {/* ── API Tab ── */}
      {tab === 'api' && (
        <div className="space-y-3">
          {ENDPOINTS.map((ep) => (
            <EndpointCard key={`${ep.method}-${ep.path}`} ep={ep} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Inline node form (shared between add/edit) ── */
function App() {
  const [page, setPage] = useState<string>('dashboard');
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [appCount, setAppCount] = useState(0);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsPinned, setLogsPinned] = useState(false);

  // Cross-panel navigation via custom event (used by Chat → Apps handoff)
  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { page?: string; payload?: unknown }
        | undefined;
      if (!detail?.page) return;
      setPage(detail.page);
      if (detail.page === 'apps' && detail.payload) {
        // Re-dispatch so AppsPanel (already mounted) can pick it up
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('apps:prefill-prompt', { detail: detail.payload }),
          );
        }, 50);
      }
    };
    window.addEventListener('nav:goto', onNav as EventListener);
    return () => window.removeEventListener('nav:goto', onNav as EventListener);
  }, []);

  // Lightweight status polling
  useEffect(() => {
    const poll = () => {
      fetch(`${API_BASE}/api/system`)
        .then((r) => r.json())
        .then(setSys)
        .catch(() => {});
      fetch(`${API_BASE}/api/nodes/stats`)
        .then((r) => r.json())
        .then((s) => setNodeCount(Object.keys(s || {}).length))
        .catch(() => {});
      fetch(`${API_BASE}/api/apps`)
        .then((r) => r.json())
        .then((a) => setAppCount(Array.isArray(a) ? a.length : 0))
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => clearInterval(id);
  }, []);

  const nav = [
    {
      id: 'dashboard',
      icon: <LayoutDashboard size={18} />,
      label: 'Dashboard',
    },
    { id: 'chat', icon: <MessageSquare size={18} />, label: 'Chat' },
    { id: 'apps', icon: <Blocks size={18} />, label: 'Apps' },
    { id: 'settings', icon: <Settings size={18} />, label: 'Settings' },
  ];

  return (
    <div className="dark h-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-14 shrink-0 bg-muted/20 border-r border-border/30 flex flex-col items-center py-4 gap-1">
          {/* Logo */}
          <div className="mb-4 text-lg font-bold text-foreground/60 select-none">
            <Hexagon size={20} />
          </div>
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              title={n.label}
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm transition-all ${
                page === n.id
                  ? 'bg-foreground/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}>
              {n.icon}
            </button>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {/* Page header — hidden for apps (IDE layout) */}
          {page !== 'apps' && (
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/20 px-6 py-3 shrink-0">
              <h1 className="text-sm font-semibold tracking-wide text-foreground/80">
                {nav.find((n) => n.id === page)?.label || 'Home Server'}
              </h1>
            </div>
          )}

          {/* Apps gets full bleed (always mounted to preserve build streams), others get padding */}
          <div
            className={
              page === 'apps'
                ? 'flex-1 overflow-hidden flex flex-col'
                : 'hidden'
            }>
            <AppsPanel />
          </div>
          {page !== 'apps' && (
            <div className="p-6 flex-1 overflow-auto">
              {page === 'dashboard' && <DashboardPage />}
              {page === 'chat' && <ChatPanel />}
              {page === 'settings' && <SettingsPanel />}
            </div>
          )}
        </main>
      </div>

      {/* Log overlay — slides up from status bar */}
      <div
        className={`shrink-0 border-t border-border/30 bg-background/95 backdrop-blur-sm transition-all overflow-hidden ${
          logsOpen ? 'h-72' : 'h-0 border-t-0'
        }`}>
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/20">
          <span className="text-[11px] font-medium text-muted-foreground">
            Logs
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLogsPinned(!logsPinned)}
              title={logsPinned ? 'Unpin logs' : 'Pin logs'}
              className={`text-[11px] px-1.5 py-0.5 rounded transition-colors ${
                logsPinned
                  ? 'text-foreground bg-foreground/10'
                  : 'text-muted-foreground hover:text-foreground'
              }`}>
              {logsPinned ? '📌' : '📌'}
            </button>
            <button
              onClick={() => {
                setLogsOpen(false);
                setLogsPinned(false);
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground px-1">
              ✕
            </button>
          </div>
        </div>
        <div className="px-3 py-2 h-[calc(100%-2rem)] overflow-auto">
          <LogsPanel />
        </div>
      </div>

      {/* Status bar */}
      <footer className="h-7 shrink-0 bg-muted/15 border-t border-border/30 flex items-center px-4 gap-4 text-[11px] font-mono text-muted-foreground">
        {sys ? (
          <>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {sys.hostname}
            </span>
            <span className="text-border/60">│</span>
            <span>Up {formatUptime(sys.uptime_seconds)}</span>
            <span className="text-border/60">│</span>
            <span className="flex items-center gap-1.5">
              CPU
              <span className="w-16 h-1.5 rounded-full bg-muted inline-block overflow-hidden align-middle">
                <span
                  className="block h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${sys.cpu.used_pct}%` }}
                />
              </span>
              <span className="tabular-nums w-7 text-right">
                {sys.cpu.used_pct.toFixed(0)}%
              </span>
            </span>
            <span className="text-border/60">│</span>
            <span className="flex items-center gap-1.5">
              Mem
              <span className="w-16 h-1.5 rounded-full bg-muted inline-block overflow-hidden align-middle">
                <span
                  className="block h-full rounded-full bg-purple-500 transition-all"
                  style={{ width: `${sys.memory.used_pct}%` }}
                />
              </span>
              <span className="tabular-nums w-7 text-right">
                {sys.memory.used_pct.toFixed(0)}%
              </span>
            </span>
            <span className="text-border/60">│</span>
            <span className="flex items-center gap-1.5">
              Disk
              <span className="w-16 h-1.5 rounded-full bg-muted inline-block overflow-hidden align-middle">
                <span
                  className="block h-full rounded-full bg-amber-500 transition-all"
                  style={{ width: `${sys.disk.used_pct}%` }}
                />
              </span>
              <span className="tabular-nums w-7 text-right">
                {sys.disk.used_pct.toFixed(0)}%
              </span>
            </span>
            <span className="ml-auto flex items-center gap-3">
              <span>
                {nodeCount} node{nodeCount !== 1 ? 's' : ''}
              </span>
              <span>
                {appCount} app{appCount !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setLogsOpen(!logsOpen)}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  logsOpen
                    ? 'text-foreground bg-foreground/10'
                    : 'hover:text-foreground'
                }`}>
                {logsOpen ? (
                  <>
                    <ChevronDown size={12} className="inline" /> Logs
                  </>
                ) : (
                  <>
                    <ChevronRight size={12} className="inline" /> Logs
                  </>
                )}
              </button>
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 border border-zinc-500/50 border-t-zinc-400 rounded-full animate-spin" />
            Connecting...
          </span>
        )}
      </footer>
    </div>
  );
}

/* ── Dashboard Page (2-column) ── */

/* ── System Charts ── */

const cpuChartConfig: ChartConfig = {
  cpu: { label: 'CPU', color: '#3b82f6' },
};
const memChartConfig: ChartConfig = {
  mem: { label: 'Memory', color: '#a855f7' },
};

function SystemCharts() {
  const [history, setHistory] = useState<
    {
      t: string;
      cpu: number;
      mem: number;
      disk: number;
      mem_mb: number;
      mem_max: number;
    }[]
  >([]);

  useEffect(() => {
    const load = () =>
      fetch(`${API_BASE}/api/system/history`)
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) setHistory(d);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  if (history.length < 2) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* CPU chart */}
      <div className="rounded-lg border border-border/30 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">
            CPU Usage
          </span>
          <span className="text-[11px] tabular-nums text-blue-400">
            {history[history.length - 1]?.cpu.toFixed(1)}%
          </span>
        </div>
        <ChartContainer config={cpuChartConfig} className="h-[120px] w-full">
          <AreaChart
            data={history}
            margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="hsl(var(--border))"
              strokeOpacity={0.15}
            />
            <XAxis
              dataKey="t"
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => `${Number(value).toFixed(1)}%`}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="cpu"
              stroke="#3b82f6"
              strokeWidth={1.5}
              fill="url(#cpuGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      </div>

      {/* Memory chart */}
      <div className="rounded-lg border border-border/30 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">
            Memory Usage
          </span>
          <span className="text-[11px] tabular-nums text-purple-400">
            {history[history.length - 1]?.mem.toFixed(1)}%
            <span className="text-muted-foreground/50 ml-1">
              ({history[history.length - 1]?.mem_mb}MB)
            </span>
          </span>
        </div>
        <ChartContainer config={memChartConfig} className="h-[120px] w-full">
          <AreaChart
            data={history}
            margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="hsl(var(--border))"
              strokeOpacity={0.15}
            />
            <XAxis
              dataKey="t"
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => `${Number(value).toFixed(1)}%`}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="mem"
              stroke="#a855f7"
              strokeWidth={1.5}
              fill="url(#memGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
}

function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Apps grid on top — app store style */}
      <AppsQuickView />
      {/* System charts */}
      <SystemCharts />
      {/* System info below */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DashboardPanel />
        </div>
        <div className="lg:col-span-3 space-y-6">
          <NodesPanel />
        </div>
      </div>
    </div>
  );
}

/* ── App Store grid for dashboard ── */
function AppsQuickView() {
  const [apps, setApps] = useState<AppInfo[]>([]);
  useEffect(() => {
    fetch(`${API_BASE}/api/apps`)
      .then((r) => r.json())
      .then((d) => setApps(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  if (apps.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground/70">Apps</h3>
        <span className="text-[10px] text-muted-foreground/50">
          {apps.length} deployed
        </span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {apps.map((app) => {
          const icon = app.icon || guessIcon(app.name);
          const isRunning = app.status === 'running';
          const isFailed = app.status === 'failed';
          return (
            <button
              key={app.name}
              onClick={() =>
                isRunning &&
                window.open(`${API_BASE}/apps/${app.name}/`, '_blank')
              }
              className={`group relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                isRunning
                  ? 'border-border/30 hover:border-border/60 hover:bg-muted/20 cursor-pointer'
                  : isFailed
                    ? 'border-red-500/20 opacity-60 cursor-default'
                    : 'border-border/20 opacity-50 cursor-default'
              }`}>
              <span className="text-2xl">{icon}</span>
              <span className="text-[11px] font-medium text-foreground/80 truncate w-full text-center">
                {app.name}
              </span>
              {/* Status dot */}
              <span
                className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${
                  isRunning
                    ? 'bg-emerald-500'
                    : isFailed
                      ? 'bg-red-500'
                      : 'bg-zinc-500'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default App;
