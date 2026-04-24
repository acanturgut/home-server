import './index.css';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
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
  FileCode2,
  FileJson,
  FileType,
  File,
  Hash,
  Code2,
  Circle,
  AlertCircle,
  Home,
  Monitor,
  Package,
  Download,
  Power,
  RefreshCw,
  X,
  Cpu,
  Thermometer,
  HardDrive,
  Activity,
  Search,
  Terminal,
  Play,
  History,
  ScrollText,
  ListTree,
  Columns2,
  Minus,
  Maximize2,
  Minimize2,
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
} from 'lucide-react';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { markdown } from '@codemirror/lang-markdown';
import { tags } from '@lezer/highlight';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
  HighlightStyle,
} from '@codemirror/language';

/* ── GitHub Dark theme for CodeMirror ── */
const ghDarkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#000000',
      color: '#e6edf3',
    },
    '.cm-content': {
      caretColor: '#58a6ff',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#58a6ff',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: '#264f78',
      },
    '.cm-panels': {
      backgroundColor: '#0a0a0a',
      color: '#e6edf3',
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: '1px solid #30363d',
    },
    '.cm-panels.cm-panels-bottom': {
      borderTop: '1px solid #30363d',
    },
    '.cm-searchMatch': {
      backgroundColor: '#e2c08d80',
      outline: '1px solid #e2c08d40',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: '#264f78',
    },
    '.cm-activeLine': {
      backgroundColor: '#161b2280',
    },
    '.cm-selectionMatch': {
      backgroundColor: '#3fb95040',
    },
    '&.cm-focused .cm-matchingBracket': {
      backgroundColor: '#3fb95040',
    },
    '.cm-gutters': {
      backgroundColor: '#000000',
      color: '#484f58',
      borderRight: '1px solid #1a1a1a',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#0a0a0a',
      color: '#e6edf3',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: '#21262d',
      border: 'none',
      color: '#8b949e',
    },
    '.cm-tooltip': {
      border: '1px solid #30363d',
      backgroundColor: '#161b22',
      color: '#e6edf3',
    },
    '.cm-tooltip .cm-tooltip-arrow:before': {
      borderTopColor: '#30363d',
      borderBottomColor: '#30363d',
    },
    '.cm-tooltip .cm-tooltip-arrow:after': {
      borderTopColor: '#161b22',
      borderBottomColor: '#161b22',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: '#264f78',
      },
    },
  },
  { dark: true },
);

const ghDarkHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#ff7b72' },
  {
    tag: [tags.name, tags.deleted, tags.character, tags.macroName],
    color: '#e6edf3',
  },
  { tag: [tags.function(tags.variableName), tags.labelName], color: '#d2a8ff' },
  {
    tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)],
    color: '#79c0ff',
  },
  { tag: [tags.definition(tags.name), tags.separator], color: '#e6edf3' },
  {
    tag: [
      tags.typeName,
      tags.className,
      tags.number,
      tags.changed,
      tags.annotation,
      tags.modifier,
      tags.self,
      tags.namespace,
    ],
    color: '#ffa657',
  },
  {
    tag: [
      tags.operator,
      tags.operatorKeyword,
      tags.url,
      tags.escape,
      tags.regexp,
      tags.link,
      tags.special(tags.string),
    ],
    color: '#79c0ff',
  },
  { tag: [tags.meta, tags.comment], color: '#8b949e' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: '#58a6ff', textDecoration: 'underline' },
  { tag: tags.heading, fontWeight: 'bold', color: '#79c0ff' },
  {
    tag: [tags.atom, tags.bool, tags.special(tags.variableName)],
    color: '#79c0ff',
  },
  {
    tag: [tags.processingInstruction, tags.string, tags.inserted],
    color: '#a5d6ff',
  },
  { tag: tags.invalid, color: '#f97583' },
]);
import { ScrollArea } from '@/components/ui/scroll-area';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:8080`;

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  summary: string;
  body?: string;
  pathParams?: string[];
  queryParams?: { name: string; default?: string }[];
}

const ENDPOINTS: Endpoint[] = [
  {
    method: 'GET',
    path: '/api/health',
    summary: 'System health, Ollama status & node online/offline',
  },
  {
    method: 'GET',
    path: '/api/config',
    summary: 'Current server configuration (router model, ollama host)',
  },
  {
    method: 'PUT',
    path: '/api/config',
    summary: 'Update server config (e.g. router model)',
    body: JSON.stringify({ router_model: 'gemma3:1b' }, null, 2),
  },
  {
    method: 'GET',
    path: '/api/logs',
    summary: 'Recent server logs',
    queryParams: [{ name: 'n', default: '50' }],
  },
  { method: 'GET', path: '/api/nodes', summary: 'List all compute nodes' },
  {
    method: 'POST',
    path: '/api/nodes',
    summary: 'Add a new compute node',
    body: JSON.stringify(
      {
        name: 'My PC',
        host: 'http://192.168.50.100:1234',
        tier: 'high-end',
        gpu: 'RTX 4090',
        mac: '',
        model: '',
      },
      null,
      2,
    ),
  },
  {
    method: 'PUT',
    path: '/api/nodes/{id}',
    summary: 'Update a compute node',
    pathParams: ['id'],
    body: JSON.stringify(
      {
        name: 'My PC',
        host: 'http://192.168.50.100:1234',
        tier: 'high-end',
        gpu: 'RTX 4090',
        mac: '',
        model: '',
      },
      null,
      2,
    ),
  },
  {
    method: 'DELETE',
    path: '/api/nodes/{id}',
    summary: 'Delete a compute node',
    pathParams: ['id'],
  },
  {
    method: 'POST',
    path: '/api/nodes/{id}/wake',
    summary: 'Send Wake-on-LAN magic packet',
    pathParams: ['id'],
  },
  {
    method: 'GET',
    path: '/api/nodes/{id}/models',
    summary: 'List models on a node (LM Studio)',
    pathParams: ['id'],
  },
  {
    method: 'POST',
    path: '/api/chat',
    summary: 'Send a chat message (non-streaming)',
    body: JSON.stringify(
      { messages: [{ role: 'user', content: 'Hello!' }] },
      null,
      2,
    ),
  },
  {
    method: 'POST',
    path: '/api/chat/stream',
    summary: 'Chat message (streaming NDJSON)',
    body: JSON.stringify(
      { messages: [{ role: 'user', content: 'Hello!' }] },
      null,
      2,
    ),
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-emerald-400',
  POST: 'text-blue-400',
  PUT: 'text-amber-400',
  DELETE: 'text-red-400',
};

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [body, setBody] = useState(ep.body || '');
  const [params, setParams] = useState<Record<string, string>>(() => {
    const p: Record<string, string> = {};
    ep.pathParams?.forEach((k) => (p[k] = ''));
    ep.queryParams?.forEach((q) => (p[q.name] = q.default || ''));
    return p;
  });
  const [response, setResponse] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const buildUrl = useCallback(() => {
    let url = `${API_BASE}${ep.path}`;
    ep.pathParams?.forEach((k) => {
      url = url.replace(`{${k}}`, encodeURIComponent(params[k] || ''));
    });
    if (ep.queryParams?.length) {
      const qs = ep.queryParams
        .filter((q) => params[q.name])
        .map((q) => `${q.name}=${encodeURIComponent(params[q.name])}`)
        .join('&');
      if (qs) url += `?${qs}`;
    }
    return url;
  }, [ep, params]);

  const execute = async () => {
    setLoading(true);
    setResponse(null);
    setStatus(null);
    try {
      const url = buildUrl();
      const opts: RequestInit = { method: ep.method };
      if (body && (ep.method === 'POST' || ep.method === 'PUT')) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = body;
      }
      if (ep.path === '/api/chat/stream') {
        const res = await fetch(url, opts);
        setStatus(res.status);
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let text = '';
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
            setResponse(text);
          }
        }
      } else {
        const res = await fetch(url, opts);
        setStatus(res.status);
        const text = await res.text();
        try {
          setResponse(JSON.stringify(JSON.parse(text), null, 2));
        } catch {
          setResponse(text);
        }
      }
    } catch (e: unknown) {
      setResponse(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setStatus(0);
    }
    setLoading(false);
  };

  return (
    <div className="border-b border-border/10 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 py-2 px-1 text-left hover:bg-white/[0.02] transition-colors">
        <span className={`font-mono text-[10px] font-semibold w-12 shrink-0 ${METHOD_COLORS[ep.method]}`}>
          {ep.method}
        </span>
        <code className="text-[11px] font-mono text-foreground/70 flex-1 min-w-0 truncate">
          {ep.path}
        </code>
        <span className="text-[10px] text-muted-foreground/40 hidden sm:block truncate max-w-[200px]">
          {ep.summary}
        </span>
        <ChevronDown size={12} className={`text-muted-foreground/30 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="pb-3 px-1 space-y-2.5">
          <p className="text-[10px] text-muted-foreground/60">{ep.summary}</p>
          {ep.pathParams?.map((k) => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground/40 w-16 shrink-0">:{k}</span>
              <input
                placeholder={k}
                value={params[k] || ''}
                onChange={(e) => setParams((p) => ({ ...p, [k]: e.target.value }))}
                className="flex-1 h-6 text-[11px] font-mono bg-transparent border-b border-border/20 focus:border-foreground/30 focus:outline-none px-1 transition-colors"
              />
            </div>
          ))}
          {ep.queryParams?.map((q) => (
            <div key={q.name} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground/40 w-16 shrink-0">?{q.name}</span>
              <input
                placeholder={q.default || q.name}
                value={params[q.name] || ''}
                onChange={(e) => setParams((p) => ({ ...p, [q.name]: e.target.value }))}
                className="flex-1 h-6 text-[11px] font-mono bg-transparent border-b border-border/20 focus:border-foreground/30 focus:outline-none px-1 transition-colors"
              />
            </div>
          ))}
          {ep.body && (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full font-mono text-[10px] bg-white/[0.02] border border-border/15 rounded p-2 min-h-[80px] resize-y focus:outline-none focus:border-foreground/20 transition-colors"
              spellCheck={false}
            />
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={execute}
              disabled={loading}
              className="px-3 py-1 rounded text-[10px] font-medium bg-foreground/10 hover:bg-foreground/15 disabled:opacity-40 transition-colors">
              {loading ? '...' : 'Run'}
            </button>
            <code className="text-[9px] text-muted-foreground/30 truncate">
              {buildUrl()}
            </code>
          </div>
          {response !== null && (
            <div className="space-y-1">
              {status !== null && (
                <span className={`text-[10px] font-mono ${status >= 200 && status < 300 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {status}
                </span>
              )}
              <pre className="text-[10px] font-mono text-foreground/60 bg-black/20 rounded p-2 max-h-[300px] overflow-auto whitespace-pre-wrap break-words">
                {response}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── System Dashboard ── */

interface SystemInfo {
  hostname: string;
  uptime_seconds: number;
  os: string;
  arch: string;
  cpu: { cores: number; used_pct: number };
  memory: {
    total_mb: number;
    used_mb: number;
    free_mb: number;
    used_pct: number;
  };
  disk: {
    total_gb: number;
    used_gb: number;
    free_gb: number;
    used_pct: number;
    path: string;
  };
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function DashboardPanel() {
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/system`)
      .then((r) => r.json())
      .then(setSys)
      .catch(() => setSys(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!sys) {
    return (
      <div className="rounded-lg border border-border/30 p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        {loading ? (
          <>
            <span className="inline-block w-3.5 h-3.5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
            Loading...
          </>
        ) : (
          'Server unreachable'
        )}
      </div>
    );
  }

  const MiniBar = ({
    pct,
    color,
    label,
    detail,
  }: {
    pct: number;
    color: string;
    label: string;
    detail: string;
  }) => (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium" style={{ color }}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground/60">{detail}</p>
    </div>
  );

  return (
    <div className="rounded-lg border border-border/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{sys.hostname}</p>
          <p className="text-[11px] text-muted-foreground">
            {sys.os}/{sys.arch} · Up {formatUptime(sys.uptime_seconds)}
          </p>
        </div>
        <button
          onClick={refresh}
          className="text-[11px] text-muted-foreground hover:text-foreground">
          {loading ? '...' : '↻'}
        </button>
      </div>
      <div className="space-y-3">
        <MiniBar
          pct={sys.cpu.used_pct}
          color="#3b82f6"
          label="CPU"
          detail={`${sys.cpu.cores} cores`}
        />
        <MiniBar
          pct={sys.memory.used_pct}
          color="#a855f7"
          label="Memory"
          detail={`${sys.memory.used_mb} / ${sys.memory.total_mb} MB`}
        />
        <MiniBar
          pct={sys.disk.used_pct}
          color="#f59e0b"
          label="Disk"
          detail={`${sys.disk.used_gb} / ${sys.disk.total_gb} GB`}
        />
      </div>
    </div>
  );
}

/* ── Full Logs Viewer ── */

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  request_id?: string;
  route?: string;
  model?: string;
  node?: string;
  tier?: string;
  latency?: string;
}

/* ── Nodes Dashboard ── */

interface NodeStats {
  node_id: string;
  hostname: string;
  os: string;
  arch: string;
  cpu_model: string;
  cpu_cores: number;
  cpu_usage: number;
  mem_total_gb: number;
  mem_used_gb: number;
  mem_pct: number;
  disk_total_gb: number;
  disk_used_gb: number;
  disk_pct: number;
  gpu_name?: string;
  gpu_usage?: number;
  gpu_mem_total_mb?: number;
  gpu_mem_used_mb?: number;
  gpu_temp?: number;
  cpu_temp?: number;
  uptime_secs: number;
  last_seen: string;
}

function NodesPanel() {
  const [stats, setStats] = useState<Record<string, NodeStats>>({});
  const [nodes, setNodes] = useState<
    { id: string; name: string; host: string; mac?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    Promise.all([
      fetch(`${API_BASE}/api/nodes/stats`).then((r) => r.json()),
      fetch(`${API_BASE}/api/nodes`).then((r) => r.json()),
    ])
      .then(([s, n]) => {
        setStats(s && typeof s === 'object' && !Array.isArray(s) ? s : {});
        setNodes(Array.isArray(n) ? n : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);

  if (loading)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <span className="inline-block w-3.5 h-3.5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
        Loading nodes...
      </div>
    );

  const onlineNodes = nodes.filter((n) => stats[n.id]);
  const offlineNodes = nodes.filter((n) => !stats[n.id]);
  // Show agent-only nodes (reporting via heartbeat but not in config)
  const configuredIds = new Set(nodes.map((n) => n.id));
  const agentOnlyNodes = Object.keys(stats)
    .filter((id) => !configuredIds.has(id))
    .map((id) => ({
      id,
      name: stats[id].hostname || id,
      host: '',
    }));

  return (
    <div className="space-y-2">
      {onlineNodes.length === 0 &&
        agentOnlyNodes.length === 0 &&
        offlineNodes.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No nodes configured
          </p>
        )}
      {[...onlineNodes, ...agentOnlyNodes].map((n) => {
        const s = stats[n.id];
        const isOnline =
          new Date().getTime() - new Date(s.last_seen).getTime() < 30000;
        return (
          <div
            key={n.id}
            className="rounded-lg border border-border/30 p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`}
              />
              <span className="text-sm font-medium">
                {s.hostname || n.name}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {s.cpu_model} · {s.cpu_cores}c · Up{' '}
                {formatUptime(s.uptime_secs)}
              </span>
            </div>
            {/* Inline bars */}
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: 'CPU',
                  pct: s.cpu_usage,
                  color: '#3b82f6',
                  extra: s.cpu_temp ? `${s.cpu_temp}°C` : '',
                },
                {
                  label: 'Mem',
                  pct: s.mem_pct,
                  color: '#a855f7',
                  extra: `${s.mem_used_gb.toFixed(1)}/${s.mem_total_gb.toFixed(1)}G`,
                },
                {
                  label: 'Disk',
                  pct: s.disk_pct,
                  color: '#f59e0b',
                  extra: `${s.disk_used_gb.toFixed(0)}/${s.disk_total_gb.toFixed(0)}G`,
                },
              ].map((b) => (
                <div key={b.label} className="space-y-0.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">{b.label}</span>
                    <span className="tabular-nums" style={{ color: b.color }}>
                      {b.pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${b.pct}%`, backgroundColor: b.color }}
                    />
                  </div>
                  {b.extra && (
                    <p className="text-[9px] text-muted-foreground/50">
                      {b.extra}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {/* GPU */}
            {s.gpu_name && (
              <div className="flex items-center gap-3 text-[10px]">
                <span className="text-emerald-400 font-medium">
                  {s.gpu_name}
                </span>
                {s.gpu_usage != null && (
                  <span className="text-muted-foreground">
                    GPU {s.gpu_usage}%
                  </span>
                )}
                {s.gpu_mem_total_mb != null && s.gpu_mem_total_mb > 0 && (
                  <span className="text-muted-foreground">
                    VRAM {s.gpu_mem_used_mb}/{s.gpu_mem_total_mb}MB
                  </span>
                )}
                {s.gpu_temp != null && (
                  <span className="text-muted-foreground">{s.gpu_temp}°C</span>
                )}
              </div>
            )}
          </div>
        );
      })}
      {offlineNodes.length > 0 && (
        <div className="px-1 space-y-1">
          {offlineNodes.map((n) => (
            <div
              key={n.id}
              className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
              {n.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LogsPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('ALL');

  const fetchLogs = useCallback(() => {
    fetch(`${API_BASE}/api/logs?n=500`)
      .then((r) => r.json())
      .then((data: LogEntry[]) =>
        setLogs(Array.isArray(data) ? data.reverse() : []),
      )
      .catch(() => setLogs([]));
  }, []);

  useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, 3000);
    return () => clearInterval(id);
  }, [fetchLogs]);

  const filtered = logs.filter((l) => {
    if (levelFilter !== 'ALL' && l.level !== levelFilter) return false;
    if (filter && !l.message.toLowerCase().includes(filter.toLowerCase()))
      return false;
    return true;
  });

  return (
    <div className="space-y-2">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <input
          placeholder="Filter..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-7 text-xs flex-1 rounded-md border border-border/30 bg-transparent px-2 focus:outline-none focus:ring-1 focus:ring-ring/30"
        />
        {['ALL', 'INFO', 'ERROR'].map((lv) => (
          <button
            key={lv}
            onClick={() => setLevelFilter(lv)}
            className={`text-[10px] px-2 py-1 rounded-md transition-colors ${
              levelFilter === lv
                ? 'bg-foreground/10 text-foreground'
                : lv === 'ERROR'
                  ? 'text-red-400/60 hover:text-red-400'
                  : 'text-muted-foreground hover:text-foreground'
            }`}>
            {lv}
          </button>
        ))}
        <button
          onClick={fetchLogs}
          className="text-[11px] text-muted-foreground hover:text-foreground">
          ↻
        </button>
      </div>

      {/* Log list */}
      <div className="rounded-lg border border-border/30 overflow-hidden">
        <ScrollArea className="h-[200px]">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              No logs
            </p>
          ) : (
            <div className="divide-y divide-border/10">
              {filtered.map((l, i) => (
                <div
                  key={i}
                  className="px-3 py-1 hover:bg-muted/10 transition-colors">
                  <div className="flex items-start gap-2 text-[11px] font-mono">
                    <span className="text-muted-foreground/50 shrink-0 w-[62px] tabular-nums">
                      {l.timestamp
                        ? new Date(l.timestamp).toLocaleTimeString()
                        : ''}
                    </span>
                    <span
                      className={`shrink-0 w-[38px] ${l.level === 'ERROR' ? 'text-red-400' : 'text-emerald-400/60'}`}>
                      {l.level}
                    </span>
                    <span className="text-foreground/70 break-all flex-1">
                      {l.message}
                    </span>
                  </div>
                  {(l.route || l.model || l.node || l.latency) && (
                    <div className="flex gap-2 ml-[108px] mt-0.5 text-[9px]">
                      {l.route && (
                        <span className="text-blue-400/60">{l.route}</span>
                      )}
                      {l.model && (
                        <span className="text-purple-400/60">{l.model}</span>
                      )}
                      {l.node && (
                        <span className="text-amber-400/60">{l.node}</span>
                      )}
                      {l.latency && (
                        <span className="text-muted-foreground/40">
                          {l.latency}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
      <p className="text-[10px] text-muted-foreground/40 text-center">
        {filtered.length}/{logs.length} entries
      </p>
    </div>
  );
}

/* ── Apps Panel ── */

interface BuildRecord {
  action: string;
  prompt: string;
  status: string;
  duration: string;
  node: string;
  timestamp: string;
}

interface AppInfo {
  name: string;
  icon?: string;
  port: number;
  healthcheck: string;
  route: string;
  type: string;
  status: string;
  prompt: string;
  error?: string;
  created_at: string;
  updated_at: string;
  builds?: BuildRecord[];
}

interface BuildEvent {
  step: string;
  message: string;
  detail?: string;
  latency?: string;
  timestamp?: string;
  tasks?: BuildTask[];
  taskId?: number;
}

interface BuildTask {
  id: number;
  title: string;
  description: string;
  worker: string; // "heavy" or "light"
  nodeName?: string;
  model?: string;
  status: string; // "pending", "running", "done", "error"
  latency?: string;
}

const PIPELINE_STEPS = [
  'planning',
  'task',
  'merging',
  'validating',
  'deploying',
  'done',
] as const;

const STEP_LABELS: Record<string, string> = {
  planning: 'Plan',
  task: 'Tasks',
  merging: 'Merge',
  validating: 'Validate',
  deploying: 'Deploy',
  done: 'Done',
  error: 'Error',
};

const STEP_COLORS: Record<string, string> = {
  planning: 'text-violet-400',
  task: 'text-cyan-400',
  merging: 'text-amber-400',
  validating: 'text-orange-400',
  deploying: 'text-emerald-400',
  done: 'text-green-400',
  error: 'text-red-400',
};

/* ── GPU / Node stats widget shown during builds ── */
function BuildNodeStats({ building }: { building: boolean }) {
  const [stats, setStats] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!building) return;
    const poll = () => {
      fetch(`${API_BASE}/api/nodes/stats`)
        .then((r) => r.json())
        .then((s) => setStats(s || {}))
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [building]);

  if (!building) return null;
  const entries = Object.values(stats).filter(
    (s: any) => s.gpu_name && new Date().getTime() - new Date(s.last_seen).getTime() < 30000,
  ) as any[];
  if (entries.length === 0) return null;

  return (
    <div className="px-3 py-1.5 border-b border-border/10 space-y-1.5">
      {entries.map((s: any) => {
        const gpuMemPct = s.gpu_mem_total_mb ? Math.round((s.gpu_mem_used_mb / s.gpu_mem_total_mb) * 100) : 0;
        return (
          <div key={s.node_id} className="space-y-1">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
              <Activity size={10} className="shrink-0" />
              <span className="font-medium text-foreground/50">{s.hostname || s.node_id}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground/40 truncate">{s.gpu_name}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[9px]">
              <div className="flex items-center gap-1.5">
                <Cpu size={9} className="text-blue-400/60 shrink-0" />
                <span className="text-muted-foreground/50">GPU</span>
                <div className="flex-1 h-1 rounded-full bg-muted/30 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${s.gpu_usage || 0}%` }} />
                </div>
                <span className="tabular-nums text-foreground/50 w-6 text-right">{s.gpu_usage || 0}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <HardDrive size={9} className="text-purple-400/60 shrink-0" />
                <span className="text-muted-foreground/50">VRAM</span>
                <div className="flex-1 h-1 rounded-full bg-muted/30 overflow-hidden">
                  <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${gpuMemPct}%` }} />
                </div>
                <span className="tabular-nums text-foreground/50 w-12 text-right">{((s.gpu_mem_used_mb || 0) / 1024).toFixed(1)}G</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Thermometer size={9} className="text-orange-400/60 shrink-0" />
                <span className="text-muted-foreground/50">Temp</span>
                <span className={`tabular-nums ml-auto ${(s.gpu_temp || 0) > 80 ? 'text-red-400' : (s.gpu_temp || 0) > 65 ? 'text-amber-400' : 'text-foreground/50'}`}>{s.gpu_temp || '—'}°C</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function fmtTime(ts?: string) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

function PipelineProgress({ events }: { events: BuildEvent[] }) {
  const activeSteps = new Set(events.map((e) => e.step));
  const lastStep = events.length > 0 ? events[events.length - 1].step : '';
  const hasError = activeSteps.has('error');

  return (
    <div className="py-1">
      {PIPELINE_STEPS.map((step, i) => {
        const done =
          activeSteps.has(step) && (step !== lastStep || step === 'done');
        const active = step === lastStep && step !== 'done' && !hasError;
        return (
          <div key={step} className="flex items-start gap-0">
            {/* Dot + connector column */}
            <div className="flex flex-col items-center w-4 shrink-0">
              {active ? (
                <span className="w-2.5 h-2.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin mt-[1px]" />
              ) : (
                <span
                  className={`w-2 h-2 rounded-full mt-[3px] ${
                    done
                      ? 'bg-emerald-400'
                      : hasError && activeSteps.has(step)
                        ? 'bg-red-400'
                        : 'bg-muted-foreground/20'
                  }`}
                />
              )}
              {i < PIPELINE_STEPS.length - 1 && (
                <div
                  className={`w-px flex-1 min-h-[8px] mt-0.5 ${done ? 'bg-emerald-500/30' : 'bg-border/20'}`}
                />
              )}
            </div>
            {/* Label */}
            <span
              className={`text-[10px] leading-tight pb-1 ${
                done
                  ? 'text-emerald-400/80'
                  : active
                    ? 'text-blue-400 font-medium'
                    : 'text-muted-foreground/40'
              }`}>
              {STEP_LABELS[step]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EventLog({
  events,
  expanded,
}: {
  events: BuildEvent[];
  expanded?: boolean;
}) {
  const [openDetails, setOpenDetails] = useState<Set<number>>(new Set());

  return (
    <div className={`space-y-0 ${expanded ? '' : 'max-h-64 overflow-auto'}`}>
      {events.map((ev, i) => (
        <div key={i} className="group">
          <div
            className={`flex items-start gap-2 text-[11px] font-mono px-1 py-0.5 rounded hover:bg-muted/10 transition-colors ${ev.detail ? 'cursor-pointer' : ''}`}
            onClick={() => {
              if (!ev.detail) return;
              setOpenDetails((prev) => {
                const next = new Set(prev);
                next.has(i) ? next.delete(i) : next.add(i);
                return next;
              });
            }}>
            <span className="text-muted-foreground/40 shrink-0 tabular-nums whitespace-nowrap">
              {fmtTime(ev.timestamp)}
            </span>
            <span
              className={`shrink-0 whitespace-nowrap ${STEP_COLORS[ev.step] || 'text-blue-400/60'}`}>
              {STEP_LABELS[ev.step] || ev.step}
            </span>
            <span className="text-foreground/60 flex-1 break-words whitespace-pre-wrap">
              {ev.message}
            </span>
            {ev.latency && (
              <span className="text-muted-foreground/30 ml-auto shrink-0 tabular-nums">
                {ev.latency}
              </span>
            )}
          </div>
          {ev.detail && openDetails.has(i) && (
            <div className="ml-[60px] mr-2 mb-1 p-2 rounded bg-muted/20 border border-border/10">
              <pre className="text-[10px] font-mono text-muted-foreground/60 whitespace-pre-wrap break-words max-h-48 overflow-auto">
                {ev.detail}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TaskBoard({ events }: { events: BuildEvent[] }) {
  const taskBoardEvent = events.find((e) => e.tasks && e.tasks.length > 0);
  if (!taskBoardEvent?.tasks) return null;

  const taskStatus = new Map<
    number,
    { status: string; latency?: string; files?: string }
  >();
  for (const ev of events) {
    if (ev.step === 'task' && ev.taskId) {
      if (ev.message.startsWith('▶'))
        taskStatus.set(ev.taskId, { status: 'running' });
      else if (ev.message.startsWith('✓'))
        taskStatus.set(ev.taskId, {
          status: 'done',
          latency: ev.latency,
          files: ev.detail,
        });
      else if (ev.message.startsWith('✗'))
        taskStatus.set(ev.taskId, { status: 'error' });
    }
  }

  const planEvent = events.find(
    (e) => e.step === 'planning' && e.detail && e.detail.startsWith('{'),
  );
  let plan: { description?: string; architecture?: string } | null = null;
  if (planEvent?.detail) {
    try {
      plan = JSON.parse(planEvent.detail);
    } catch {}
  }

  const tasks = taskBoardEvent.tasks;
  const doneCount = [...taskStatus.values()].filter(
    (s) => s.status === 'done',
  ).length;

  return (
    <div className="px-3 py-2.5 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {doneCount}/{tasks.length} tasks
        </span>
        {plan?.description && (
          <span className="text-[10px] text-muted-foreground/50 truncate ml-4">
            {plan.description}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-muted/30 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${(doneCount / tasks.length) * 100}%` }}
        />
      </div>

      {/* Task list — compact */}
      <div className="space-y-px">
        {tasks.map((task) => {
          const live = taskStatus.get(task.id);
          const status = live?.status || task.status;
          return (
            <div
              key={task.id}
              className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/10 transition-colors">
              <span
                className={`text-[10px] shrink-0 ${
                  status === 'done'
                    ? 'text-emerald-400'
                    : status === 'running'
                      ? 'text-blue-400 animate-pulse'
                      : status === 'error'
                        ? 'text-red-400'
                        : 'text-muted-foreground/30'
                }`}>
                {status === 'done'
                  ? '✓'
                  : status === 'running'
                    ? '◐'
                    : status === 'error'
                      ? '✗'
                      : '○'}
              </span>
              <span
                className={`text-[11px] flex-1 truncate ${status === 'done' ? 'text-muted-foreground' : 'text-foreground/80'}`}>
                {task.title}
              </span>
              <span
                className={`text-[9px] shrink-0 px-1.5 py-0.5 rounded ${
                  task.worker === 'heavy'
                    ? 'text-cyan-400/70 bg-cyan-500/5'
                    : 'text-teal-400/70 bg-teal-500/5'
                }`}>
                {task.worker === 'heavy' ? '⚡' : '💡'}{' '}
                {task.nodeName || task.worker}
              </span>
              {live?.latency && (
                <span className="text-[9px] text-muted-foreground/40 tabular-nums shrink-0">
                  {live.latency}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface AppFile {
  path: string;
  size: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/* ── File tree node structure ── */
interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

function buildTree(files: AppFile[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isDir: true, children: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const name = parts[i];
      const fullPath = parts.slice(0, i + 1).join('/');
      let child = node.children.find((c) => c.name === name);
      if (!child) {
        child = { name, path: fullPath, isDir: !isLast, children: [] };
        node.children.push(child);
      }
      node = child;
    }
  }
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(root.children);
  return root.children;
}

function FileTreeNode({
  node,
  depth,
  selectedFile,
  onSelect,
  expanded,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  selectedFile: string | null;
  onSelect: (path: string) => void;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}) {
  const isOpen = expanded.has(node.path);
  const isActive = selectedFile === node.path;
  const ext = node.name.split('.').pop() || '';
  const fileIcon = node.isDir
    ? isOpen
      ? <ChevronDown size={10} />
      : <ChevronRight size={10} />
    : ext === 'jsx' || ext === 'tsx'
      ? <FileCode2 size={10} />
      : ext === 'js' || ext === 'ts'
        ? <FileCode2 size={10} />
        : ext === 'json'
          ? <FileJson size={10} />
          : ext === 'css'
            ? <Hash size={10} />
            : ext === 'html'
              ? <Code2 size={10} />
              : ext === 'md'
                ? <FileType size={10} />
                : <File size={10} />;
  const iconColor = node.isDir
    ? 'text-blue-400/60'
    : ext === 'jsx' || ext === 'tsx'
      ? 'text-cyan-400/70'
      : ext === 'js' || ext === 'ts'
        ? 'text-yellow-400/70'
        : ext === 'json'
          ? 'text-amber-400/50'
          : ext === 'css'
            ? 'text-purple-400/70'
            : 'text-muted-foreground/40';

  return (
    <>
      <button
        onClick={() => (node.isDir ? onToggle(node.path) : onSelect(node.path))}
        className={`w-full flex items-center gap-1 py-[3px] text-[11px] font-mono transition-colors hover:bg-white/[0.03] ${
          isActive ? 'bg-blue-500/8 text-blue-300' : 'text-muted-foreground/70'
        }`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        title={node.path}>
        <span className={`shrink-0 w-4 text-center text-[9px] ${iconColor}`}>
          {fileIcon}
        </span>
        <span
          className={`truncate ${node.isDir ? 'text-muted-foreground/60' : ''}`}>
          {node.name}
        </span>
      </button>
      {node.isDir &&
        isOpen &&
        node.children.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedFile={selectedFile}
            onSelect={onSelect}
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

/* ── CodeMirror language helper ── */
function getLang(ext: string) {
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return javascript({
        jsx: ext.includes('x'),
        typescript: ext.startsWith('t'),
      });
    case 'json':
      return json();
    case 'html':
      return html();
    case 'css':
      return css();
    case 'md':
      return markdown();
    default:
      return javascript();
  }
}

/* CodeMirror-based editor */
function CodeEditor({
  value,
  onChange,
  ext,
  onSave,
}: {
  value: string;
  onChange: (v: string) => void;
  ext: string;
  onSave?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const isSyncingRef = useRef(false);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  // Create editor once
  useEffect(() => {
    if (!containerRef.current) return;
    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          onSaveRef.current?.();
          return true;
        },
      },
    ]);
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          bracketMatching(),
          indentOnInput(),
          highlightSelectionMatches(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          keymap.of([...defaultKeymap, ...searchKeymap, indentWithTab]),
          saveKeymap,
          getLang(ext),
          ghDarkTheme,
          syntaxHighlighting(ghDarkHighlight),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !isSyncingRef.current) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '12px' },
            '.cm-scroller': {
              overflow: 'auto',
              fontFamily: '"SF Mono", "Fira Code", Menlo, Consolas, monospace',
            },
            '.cm-content': { padding: '8px 0' },
          }),
        ],
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ext]); // recreate when language changes

  // Sync external value changes (e.g. file switch)
  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      isSyncingRef.current = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
      isSyncingRef.current = false;
    }
  }, [value]);

  return <div ref={containerRef} className="w-full h-full" />;
}

/* ═══════════════════════════════════════════════════════════════
   AppsPanel — IDE-style layout with chat
   ┌─────────┬───────────────────────┬──────────────┐
   │ app bar │   code editor         │  build panel │
   │ + build │                       │  / app info  │
   │  input  │                       │              │
   └─────────┴────── event log ──────┴──────────────┘
   ═══════════════════════════════════════════════════════════════ */

type BottomTab = 'events' | 'logs' | 'terminal';
type BottomState = 'minimized' | 'normal' | 'expanded';

interface TermEntry {
  cmd: string;
  output: string;
  status: string;
}

function BottomPanelTabBar({
  active,
  onChange,
  events,
  selectedApp,
}: {
  active: BottomTab;
  onChange: (t: BottomTab) => void;
  events: BuildEvent[];
  selectedApp: string | null;
}) {
  const tabs: { id: BottomTab; label: string; icon: React.ReactNode }[] = [
    { id: 'events', label: 'Events', icon: <ListTree size={11} /> },
    { id: 'logs', label: 'Container', icon: <ScrollText size={11} /> },
    { id: 'terminal', label: 'Terminal', icon: <Terminal size={11} /> },
  ];
  return (
    <div className="flex items-center gap-0">
      {tabs.map((t) => {
        const disabled = (t.id === 'logs' || t.id === 'terminal') && !selectedApp;
        return (
          <button
            key={t.id}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onChange(t.id);
            }}
            className={`flex items-center gap-1.5 px-2.5 h-7 text-[10px] uppercase tracking-wider transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              active === t.id
                ? 'text-foreground/80 border-b border-foreground/40 bg-white/[0.02]'
                : 'text-muted-foreground/40 hover:text-muted-foreground/70'
            }`}>
            {t.icon}
            <span>{t.label}</span>
            {t.id === 'events' && events.length > 0 && (
              <span className="text-[9px] tabular-nums text-muted-foreground/30">{events.length}</span>
            )}
            {t.id === 'events' && events.some((e) => e.step === 'error') && (
              <AlertCircle size={9} className="text-red-400" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function TerminalView({
  selectedApp,
  appStatus,
  termCmd,
  setTermCmd,
  termHistory,
  setTermHistory,
  termRunning,
  termRef,
  runTermCmd,
}: {
  selectedApp: string | null;
  appStatus: string | undefined;
  termCmd: string;
  setTermCmd: (s: string) => void;
  termHistory: TermEntry[];
  setTermHistory: React.Dispatch<React.SetStateAction<TermEntry[]>>;
  termRunning: boolean;
  termRef: React.RefObject<HTMLDivElement | null>;
  runTermCmd: () => void;
}) {
  if (!selectedApp) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black">
        <p className="text-[11px] text-muted-foreground/30 font-mono">No app selected</p>
      </div>
    );
  }
  if (appStatus !== 'running') {
    return (
      <div className="flex-1 flex items-center justify-center bg-black">
        <div className="text-center space-y-1">
          <p className="text-[11px] text-muted-foreground/40 font-mono">Container is not running</p>
          <p className="text-[10px] text-muted-foreground/25 font-mono">Start the app to use the terminal</p>
        </div>
      </div>
    );
  }
  const prompt = `root@${selectedApp}:/app$ `;
  return (
    <div className="flex-1 flex flex-col bg-black overflow-hidden font-mono">
      <div ref={termRef} className="flex-1 overflow-auto px-3 pt-2">
        {termHistory.length === 0 && (
          <div className="text-[11px] text-emerald-500/40 leading-relaxed">
            <p>Connected to container <span className="text-emerald-400/70">{selectedApp}</span></p>
            <p className="text-muted-foreground/40 text-[10px] mt-1">Try: ls, cat server.js, node -v, npm ls, ps aux</p>
            <p className="text-muted-foreground/40 text-[10px]">Type a command and press Enter.</p>
          </div>
        )}
        {termHistory.map((entry, i) => (
          <div key={i} className="text-[11px] leading-snug">
            <div>
              <span className="text-emerald-400/80">{prompt}</span>
              <span className="text-foreground/85">{entry.cmd}</span>
            </div>
            {entry.output && (
              <pre className={`whitespace-pre-wrap break-words ${
                entry.status === 'error' ? 'text-red-400/80' : 'text-foreground/65'
              }`}>{entry.output}</pre>
            )}
          </div>
        ))}
        {termRunning && (
          <div className="text-[11px] text-emerald-400/50 leading-snug">
            <span className="animate-pulse">▊</span>
          </div>
        )}
      </div>
      <div className="flex items-center px-3 py-1.5 bg-black border-t border-emerald-500/10 shrink-0">
        <span className="text-[11px] text-emerald-400/80 font-mono whitespace-pre">{prompt}</span>
        <input
          autoFocus
          value={termCmd}
          onChange={(e) => setTermCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') runTermCmd();
            if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              setTermHistory([]);
            }
          }}
          disabled={termRunning}
          spellCheck={false}
          className="flex-1 bg-transparent text-[11px] font-mono text-foreground/85 border-0 outline-none caret-emerald-400 disabled:opacity-50"
        />
        {termHistory.length > 0 && (
          <button
            onClick={() => setTermHistory([])}
            title="Clear (Ctrl+L)"
            className="text-[10px] text-muted-foreground/30 hover:text-emerald-400/70 font-mono ml-2">
            clear
          </button>
        )}
      </div>
    </div>
  );
}

function ContainerLogsView({
  selectedApp,
  appLogs,
  appLogsLoading,
  appLogsRef,
  onRefresh,
}: {
  selectedApp: string | null;
  appLogs: string;
  appLogsLoading: boolean;
  appLogsRef: React.RefObject<HTMLPreElement | null>;
  onRefresh: () => void;
}) {
  if (!selectedApp) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black">
        <p className="text-[11px] text-muted-foreground/30 font-mono">No app selected</p>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col bg-black overflow-hidden">
      <div className="flex items-center justify-between px-3 h-6 border-b border-border/5 shrink-0 bg-black/40">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40 font-mono">
          docker logs -t {selectedApp}
        </span>
        <button
          onClick={onRefresh}
          disabled={appLogsLoading}
          className="text-[9px] text-muted-foreground/30 hover:text-foreground/60 transition-colors disabled:opacity-30">
          {appLogsLoading ? '...' : <RefreshCw size={10} />}
        </button>
      </div>
      <pre
        ref={appLogsRef}
        className="flex-1 overflow-auto px-3 py-2 text-[10px] font-mono text-muted-foreground/70 leading-relaxed whitespace-pre-wrap break-words">
        {appLogs || (appLogsLoading ? 'Loading...' : '(no logs)')}
      </pre>
    </div>
  );
}

function EventsView({
  events,
  logRef,
}: {
  events: BuildEvent[];
  logRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={logRef} className="flex-1 overflow-auto px-2 py-1 min-h-0 bg-background">
      {events.length > 0 ? (
        <EventLog events={events} expanded />
      ) : (
        <p className="text-[10px] text-muted-foreground/20 text-center pt-6 font-mono">
          No events yet
        </p>
      )}
    </div>
  );
}

function BottomPanel(props: {
  state: BottomState;
  setState: (s: BottomState) => void;
  tab: BottomTab;
  setTab: (t: BottomTab) => void;
  split: boolean;
  setSplit: (b: boolean) => void;
  splitTab: BottomTab;
  setSplitTab: (t: BottomTab) => void;
  events: BuildEvent[];
  logRef: React.RefObject<HTMLDivElement | null>;
  selectedApp: string | null;
  appStatus: string | undefined;
  appLogs: string;
  appLogsLoading: boolean;
  appLogsRef: React.RefObject<HTMLPreElement | null>;
  onRefreshLogs: () => void;
  termCmd: string;
  setTermCmd: (s: string) => void;
  termHistory: TermEntry[];
  setTermHistory: React.Dispatch<React.SetStateAction<TermEntry[]>>;
  termRunning: boolean;
  termRef: React.RefObject<HTMLDivElement | null>;
  runTermCmd: () => void;
}) {
  const heightClass = {
    minimized: 'flex-none h-7',
    normal: 'flex-none h-[260px]',
    expanded: 'flex-1 min-h-0',
  }[props.state];

  const renderView = (which: BottomTab) => {
    if (which === 'events') return <EventsView events={props.events} logRef={props.logRef} />;
    if (which === 'logs')
      return (
        <ContainerLogsView
          selectedApp={props.selectedApp}
          appLogs={props.appLogs}
          appLogsLoading={props.appLogsLoading}
          appLogsRef={props.appLogsRef}
          onRefresh={props.onRefreshLogs}
        />
      );
    return (
      <TerminalView
        selectedApp={props.selectedApp}
        appStatus={props.appStatus}
        termCmd={props.termCmd}
        setTermCmd={props.setTermCmd}
        termHistory={props.termHistory}
        setTermHistory={props.setTermHistory}
        termRunning={props.termRunning}
        termRef={props.termRef}
        runTermCmd={props.runTermCmd}
      />
    );
  };

  return (
    <div className={`border-t border-border/10 flex flex-col transition-all overflow-hidden ${heightClass}`}>
      {/* Header bar with tabs + window controls */}
      <div className="flex items-center justify-between h-7 border-b border-border/5 shrink-0 bg-muted/10 select-none">
        <div className="flex items-center">
          <BottomPanelTabBar
            active={props.tab}
            onChange={(t) => {
              props.setTab(t);
              if (props.state === 'minimized') props.setState('normal');
            }}
            events={props.events}
            selectedApp={props.selectedApp}
          />
        </div>
        <div className="flex items-center gap-1 pr-2">
          {props.selectedApp && props.state !== 'minimized' && (
            <button
              onClick={() => props.setSplit(!props.split)}
              title={props.split ? 'Single view' : 'Split view'}
              className={`p-1 rounded transition-colors ${
                props.split
                  ? 'text-foreground/70 bg-white/[0.05]'
                  : 'text-muted-foreground/40 hover:text-foreground/70 hover:bg-white/[0.03]'
              }`}>
              <Columns2 size={11} />
            </button>
          )}
          <button
            onClick={() => props.setState(props.state === 'minimized' ? 'normal' : 'minimized')}
            title={props.state === 'minimized' ? 'Restore' : 'Minimize'}
            className="p-1 rounded text-muted-foreground/40 hover:text-foreground/70 hover:bg-white/[0.03] transition-colors">
            <Minus size={11} />
          </button>
          <button
            onClick={() => props.setState(props.state === 'expanded' ? 'normal' : 'expanded')}
            title={props.state === 'expanded' ? 'Restore' : 'Maximize'}
            className="p-1 rounded text-muted-foreground/40 hover:text-foreground/70 hover:bg-white/[0.03] transition-colors">
            {props.state === 'expanded' ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
          </button>
        </div>
      </div>

      {/* Body */}
      {props.state !== 'minimized' && (
        props.split ? (
          <div className="flex-1 flex overflow-hidden min-h-0">
            <div className="flex-1 flex flex-col overflow-hidden border-r border-border/10">
              {renderView(props.tab)}
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center px-2 h-6 border-b border-border/5 shrink-0 bg-muted/10">
                <BottomPanelTabBar
                  active={props.splitTab}
                  onChange={props.setSplitTab}
                  events={props.events}
                  selectedApp={props.selectedApp}
                />
              </div>
              {renderView(props.splitTab)}
            </div>
          </div>
        ) : (
          renderView(props.tab)
        )
      )}
    </div>
  );
}

function ClarifyWizard(props: {
  prompt: string;
  loading: boolean;
  error: string | null;
  summary: string;
  questions: Array<{ id: string; question: string; hint?: string; suggestions?: string[]; required?: boolean; default?: string }>;
  answers: Record<string, string>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  name: string;
  setName: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  onClose: () => void;
  onRegenerate: () => void;
  onSkip: () => void;
  onBuild: () => void;
}) {
  const { prompt, loading, error, summary, questions, answers, setAnswers, name, setName, notes, setNotes, onClose, onRegenerate, onSkip, onBuild } = props;
  const setAns = (id: string, v: string) => setAnswers((prev) => ({ ...prev, [id]: v }));
  const answeredCount = questions.filter((q) => (answers[q.id] || '').trim()).length;
  const requiredMissing = questions.some((q) => q.required && !(answers[q.id] || '').trim());
  const sanitizeName = (v: string) => v.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 24);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[640px] max-w-[92vw] max-h-[88vh] flex flex-col bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-violet-400" />
            <h3 className="text-[12px] font-medium text-foreground/90">Refine your app idea</h3>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-muted-foreground/50 hover:text-foreground transition-colors">
            <X size={12} />
          </button>
        </div>

        {/* Original prompt */}
        <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 mb-1">Your idea</div>
          <p className="text-[12px] text-foreground/80 leading-relaxed italic">"{prompt}"</p>
          {summary && (
            <div className="mt-2 pt-2 border-t border-white/5">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 mb-1">AI understands</div>
              <p className="text-[11px] text-violet-300/80 leading-relaxed">{summary}</p>
            </div>
          )}
          {!loading && (
            <div className="mt-2 pt-2 border-t border-white/5">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles size={9} className="text-violet-400/60" />
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40">Suggested name</div>
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(sanitizeName(e.target.value))}
                placeholder="my-app"
                spellCheck={false}
                className="w-full bg-black/30 border border-white/5 rounded px-2 py-1.5 text-[11px] font-mono text-violet-200/90 placeholder:text-muted-foreground/30 focus:outline-none focus:border-violet-400/40 transition-colors"
              />
              <p className="text-[10px] text-muted-foreground/40 mt-1">Lowercase, dashes only. Used as the app folder & container name.</p>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-4 py-3">
          {loading && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Sparkles size={24} className="text-violet-400/60 animate-pulse" />
              <p className="text-[11px] text-muted-foreground/60">Thinking up the right questions...</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-3 py-6">
              <AlertCircle size={20} className="text-amber-400/70" />
              <p className="text-[11px] text-amber-300/80 text-center max-w-sm">{error}</p>
              <button
                onClick={onRegenerate}
                className="text-[10px] px-3 py-1 bg-white/[0.04] hover:bg-white/[0.08] rounded text-muted-foreground/70 hover:text-foreground transition-colors">
                Try again
              </button>
            </div>
          )}

          {!loading && !error && questions.length > 0 && (
            <div className="space-y-4">
              {questions.map((q, i) => (
                <div key={q.id} className="space-y-1.5">
                  <label className="block text-[11px] text-foreground/80">
                    <span className="text-muted-foreground/40 mr-1.5">{i + 1}.</span>
                    {q.question}
                    {q.required && <span className="text-red-400/70 ml-1">*</span>}
                  </label>
                  {q.hint && <p className="text-[10px] text-muted-foreground/40 ml-4">{q.hint}</p>}
                  <input
                    type="text"
                    value={answers[q.id] || ''}
                    onChange={(e) => setAns(q.id, e.target.value)}
                    placeholder="Your answer..."
                    className="ml-4 w-[calc(100%-1rem)] bg-black/30 border border-white/5 rounded px-2 py-1.5 text-[11px] text-foreground/90 placeholder:text-muted-foreground/30 focus:outline-none focus:border-violet-400/40 transition-colors"
                  />
                  {q.suggestions && q.suggestions.length > 0 && (
                    <div className="ml-4 flex flex-wrap gap-1.5 pt-0.5">
                      {q.suggestions.map((s) => {
                        const active = (answers[q.id] || '') === s;
                        return (
                          <button
                            key={s}
                            onClick={() => setAns(q.id, s)}
                            className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                              active
                                ? 'bg-violet-500/15 border-violet-400/40 text-violet-200'
                                : 'bg-white/[0.02] border-white/5 text-muted-foreground/60 hover:text-foreground/80 hover:border-white/15'
                            }`}>
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && !error && (
            <div className="mt-5 pt-4 border-t border-white/5 space-y-1.5">
              <label className="block text-[11px] text-foreground/80">
                Anything else? <span className="text-muted-foreground/40">(optional)</span>
              </label>
              <p className="text-[10px] text-muted-foreground/40">Extra context, design hints, libraries to use, things to avoid…</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="e.g. keep it minimalist, use Tailwind, prefer SQLite over Postgres…"
                className="w-full bg-black/30 border border-white/5 rounded px-2 py-1.5 text-[11px] text-foreground/90 placeholder:text-muted-foreground/30 focus:outline-none focus:border-violet-400/40 transition-colors resize-none"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-white/5 bg-white/[0.01]">
          <div className="flex items-center gap-2">
            <button
              onClick={onRegenerate}
              disabled={loading}
              className="text-[10px] flex items-center gap-1 px-2 py-1 text-muted-foreground/50 hover:text-foreground/80 disabled:opacity-30 transition-colors">
              <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
              Regenerate
            </button>
            {!loading && questions.length > 0 && (
              <span className="text-[9px] text-muted-foreground/40">
                {answeredCount}/{questions.length} answered
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onSkip}
              className="text-[10px] px-3 py-1.5 text-muted-foreground/60 hover:text-foreground transition-colors">
              Skip & build
            </button>
            <button
              onClick={onBuild}
              disabled={loading || requiredMissing}
              className="text-[11px] px-3 py-1.5 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/30 rounded text-violet-100 disabled:opacity-30 transition-colors flex items-center gap-1.5">
              <Sparkles size={11} />
              Build app
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppsPanel() {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [selectedApp, setSelectedApp] = useState<string | null>(() =>
    localStorage.getItem('selectedApp'),
  );
  const [prompt, setPrompt] = useState('');

  // Listen for cross-panel handoff (e.g. from Chat → "Send to Apps")
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const detail = (e as CustomEvent).detail as { prompt?: string } | undefined;
      if (detail?.prompt) {
        setPrompt(detail.prompt);
        setSelectedApp(null);
      }
    };
    window.addEventListener('apps:prefill-prompt', onPrefill as EventListener);
    return () => window.removeEventListener('apps:prefill-prompt', onPrefill as EventListener);
  }, []);
  // ── AI Clarify (pre-build wizard) ──
  type ClarifyQ = { id: string; question: string; hint?: string; suggestions?: string[]; required?: boolean; default?: string };
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [clarifyLoading, setClarifyLoading] = useState(false);
  const [clarifyError, setClarifyError] = useState<string | null>(null);
  const [claritySummary, setClaritySummary] = useState('');
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarifyQ[]>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string>>({});
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
  const [bottomState, setBottomState] = useState<'minimized' | 'normal' | 'expanded'>('normal');
  const [bottomTab, setBottomTab] = useState<'events' | 'logs' | 'terminal'>('events');
  const [bottomSplit, setBottomSplit] = useState(false);
  const [bottomSplitTab, setBottomSplitTab] = useState<'events' | 'logs' | 'terminal'>('logs');

  // App logs state
  const [appLogs, setAppLogs] = useState('');
  const [appLogsLoading, setAppLogsLoading] = useState(false);
  const appLogsRef = useRef<HTMLPreElement>(null);

  // Container stats
  const [containerStats, setContainerStats] = useState<Record<string, string> | null>(null);

  // File search
  const [fileSearch, setFileSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{file: string; line: number; text: string}[]>([]);
  const [searching, setSearching] = useState(false);

  // Terminal state
  const [termCmd, setTermCmd] = useState('');
  const [termHistory, setTermHistory] = useState<{cmd: string; output: string; status: string}[]>([]);
  const [termRunning, setTermRunning] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);

  // App settings edit
  const [editIcon, setEditIcon] = useState('');
  const [editRoute, setEditRoute] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [changeInput, setChangeInput] = useState('');
  const [actionType, setActionType] = useState<'feature' | 'fix' | 'bug'>(
    'feature',
  );
  const chatRef = useRef<HTMLDivElement>(null);

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
    const logsActive = bottomState !== 'minimized' && (bottomTab === 'logs' || (bottomSplit && bottomSplitTab === 'logs'));
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
    if (appLogsRef.current) appLogsRef.current.scrollTop = appLogsRef.current.scrollHeight;
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
    fetch(`${API_BASE}/api/apps/${selectedApp}/search?q=${encodeURIComponent(fileSearch)}`)
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
      setTermHistory((prev) => [...prev, { cmd, output: data.output || data.error || '', status: data.status || 'ok' }]);
    } catch {
      setTermHistory((prev) => [...prev, { cmd, output: 'Failed to execute', status: 'error' }]);
    }
    setTermRunning(false);
  };

  // Scroll terminal to bottom
  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [termHistory]);

  // Save app settings
  const saveSettings = async () => {
    if (!selectedApp) return;
    await fetch(`${API_BASE}/api/apps/${selectedApp}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ icon: editIcon || undefined, route: editRoute || undefined }),
    });
    refresh();
    setSettingsOpen(false);
  };

  // Stream build
  const streamNDJSON = async (url: string, body: object) => {
    setBuilding(true);
    setEvents([]);
    setRightTab('build');
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
    streamNDJSON(`${API_BASE}/api/apps/build`, { prompt: prompt.trim() });
  };

  // ── AI Clarify wizard ──
  const openClarify = async () => {
    if (!prompt.trim() || building || clarifyLoading) return;
    setClarifyOpen(true);
    setClarifyLoading(true);
    setClarifyError(null);
    setClarifyQuestions([]);
    setClarifyAnswers({});
    setClaritySummary('');
    setClarifyName('');
    setClarifyNotes('');
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
        setClarifyName(String(data.suggestedName).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 24));
      }
      const qs = Array.isArray(data.questions) ? data.questions : [];
      const parsed: ClarifyQ[] = qs
        .map((q: any, i: number) => ({
          id: String(q.id || `q${i}`),
          question: String(q.question || ''),
          hint: q.hint ? String(q.hint) : undefined,
          suggestions: Array.isArray(q.suggestions) ? q.suggestions.map(String) : undefined,
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
      if (!qs.length) setClarifyError('AI returned no questions. You can build directly.');
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
    streamNDJSON(`${API_BASE}/api/apps/build`, name ? { prompt: enriched, name } : { prompt: enriched });
  };

  const skipClarifyAndBuild = () => {
    setClarifyOpen(false);
    startBuild();
  };
  const startRebuild = (text: string) => {
    if (!text.trim() || building || !selectedApp) return;
    streamNDJSON(`${API_BASE}/api/apps/${selectedApp}/rebuild`, {
      changes: text.trim(),
    });
  };
  const startFix = (description?: string) => {
    if (building || !selectedApp) return;
    streamNDJSON(`${API_BASE}/api/apps/${selectedApp}/fix`, {
      description: description?.trim() || '',
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
    } catch {
      /* ignore */
    }
    setFileSaving(false);
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
  const hasBuild = events.length > 0;
  const lastStep = events.length > 0 ? events[events.length - 1].step : '';
  const buildDone = lastStep === 'done' || lastStep === 'error';

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
    if (building) setRightTab('build');
  }, [building]);

  return (
    <div className="flex flex-col h-full">
      <div className={`flex min-h-0 overflow-hidden ${bottomState === 'expanded' ? 'flex-none h-0' : 'flex-1'}`}>
        {/* ── Left: App sidebar ── */}
        <div className="w-52 shrink-0 border-r border-border/10 flex flex-col">
          {/* Build input — flat modern */}
          <div className="p-2.5 border-b border-border/10">
            <div className="relative">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (e.shiftKey) startBuild();
                    else openClarify();
                  }
                }}
                placeholder="What do you want to build?"
                disabled={building}
                className="w-full bg-transparent border-0 border-b border-border/20 text-xs py-2 pr-14 focus:outline-none focus:border-blue-500/40 placeholder:text-muted-foreground/30 transition-colors"
              />
              {/* AI refine (Sparkles) — opens clarify wizard */}
              <button
                onClick={openClarify}
                disabled={building || !prompt.trim() || clarifyLoading}
                title="Refine with AI (Enter)"
                className="absolute right-6 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-muted-foreground/50 hover:text-violet-400 disabled:opacity-20 transition-colors">
                <Sparkles size={11} className={clarifyLoading ? 'animate-pulse' : ''} />
              </button>
              {/* Direct build (arrow) — Shift+Enter */}
              <button
                onClick={startBuild}
                disabled={building || !prompt.trim()}
                title="Build directly (Shift+Enter)"
                className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-[10px] text-muted-foreground/50 hover:text-blue-400 disabled:opacity-20 transition-colors">
                {building ? '◌' : '→'}
              </button>
              {building && (
                <button
                  onClick={cancelBuild}
                  className="absolute -right-6 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-[9px] text-red-400/50 hover:text-red-400 transition-colors"
                  title="Cancel build">
                  ✕
                </button>
              )}
            </div>
            <p className="mt-1 text-[9px] text-muted-foreground/30">
              <kbd className="px-1 py-px bg-white/[0.04] rounded text-[8px]">Enter</kbd> refine ·
              <kbd className="ml-1 px-1 py-px bg-white/[0.04] rounded text-[8px]">⇧Enter</kbd> build
            </p>
          </div>

          {/* App list */}
          <div className="flex-1 overflow-auto">
            {apps.length === 0 && (
              <div className="p-6 text-center">
                <p className="text-[11px] text-muted-foreground/30">
                  No apps yet
                </p>
              </div>
            )}
            {apps.map((a) => {
              const icon = a.icon || guessIcon(a.name);
              const isSelected = selectedApp === a.name;
              return (
                <button
                  key={a.name}
                  onClick={() => setSelectedApp(a.name)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all ${
                    isSelected ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                  }`}>
                  <span className="text-base shrink-0">{icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[11px] truncate ${isSelected ? 'text-foreground font-medium' : 'text-muted-foreground/70'}`}>
                        {a.name}
                      </span>
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          a.status === 'running'
                            ? 'bg-emerald-500'
                            : a.status === 'building'
                              ? 'bg-amber-500 animate-pulse'
                              : a.status === 'failed'
                                ? 'bg-red-500'
                                : 'bg-zinc-600'
                        }`}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

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
                      <span className="text-muted-foreground/20 shrink-0">/</span>
                      <span className="text-muted-foreground/60 truncate min-w-0">
                        {selectedFile}
                      </span>
                    </>
                  )}
                  {fileDirty && (
                    <span className="text-amber-400/80 shrink-0"><Circle size={6} fill="currentColor" /></span>
                  )}
                  {fileLoading && (
                    <span className="text-blue-400/60 text-[9px] animate-pulse shrink-0">
                      loading
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-0.5 text-[10px] shrink-0 ml-2">
                  <button
                    onClick={saveFile}
                    disabled={!fileDirty || fileSaving}
                    className="px-2 py-0.5 text-muted-foreground/50 hover:text-foreground disabled:opacity-20 transition-colors">
                    {fileSaving ? '...' : 'Save'}
                  </button>
                  <span className="text-border/20">│</span>
                  <button
                    onClick={deployApp}
                    disabled={deploying}
                    className="px-2 py-0.5 text-emerald-400/70 hover:text-emerald-300 disabled:opacity-30 transition-colors">
                    {deploying ? '...' : 'Deploy'}
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
                      <Search size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/30" />
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
                        <button onClick={() => { setSearchResults([]); setFileSearch(''); }}
                          className="w-full text-[8px] text-muted-foreground/30 hover:text-muted-foreground/60 px-2 py-0.5 text-left">
                          <X size={8} className="inline mr-0.5" /> Clear results ({searchResults.length})
                        </button>
                        {searchResults.map((r, i) => (
                          <button
                            key={i}
                            onClick={() => setSelectedFile(r.file)}
                            className={`w-full text-left px-2 py-0.5 hover:bg-white/[0.03] transition-colors ${selectedFile === r.file ? 'bg-white/[0.04]' : ''}`}>
                            <div className="text-[9px] text-foreground/60 font-mono truncate">{r.file}</div>
                            <div className="text-[8px] text-muted-foreground/30 truncate">L{r.line}: {r.text}</div>
                          </button>
                        ))}
                      </div>
                    ) : searching ? (
                      <p className="text-[9px] text-muted-foreground/30 text-center py-2 animate-pulse">Searching...</p>
                    ) : (
                      <>
                        {tree.map((node) => (
                          <FileTreeNode
                            key={node.path}
                            node={node}
                            depth={0}
                            selectedFile={selectedFile}
                            onSelect={(path) => {
                              if (!fileDirty || confirm('Discard unsaved changes?'))
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
                    { label: 'Todo App', prompt: 'Build a modern todo app with categories, due dates, and drag-to-reorder' },
                    { label: 'Weather', prompt: 'Build a weather dashboard that shows current weather and 5-day forecast for any city' },
                    { label: 'Notes', prompt: 'Build a markdown notes app with sidebar, live preview, and local storage' },
                    { label: 'Pomodoro', prompt: 'Build a pomodoro timer with session tracking, break reminders, and statistics' },
                    { label: 'Habit Tracker', prompt: 'Build a daily habit tracker with streaks, calendar view, and progress charts' },
                    { label: 'Bookmarks', prompt: 'Build a bookmark manager with tags, search, and card previews' },
                  ].map((t) => (
                    <button
                      key={t.label}
                      onClick={() => { setPrompt(t.prompt); }}
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
          {/* Tab bar */}
          <div className="flex h-8 border-b border-border/10 shrink-0">
            {(['info', 'build', 'chat'] as const).map((tab) => {
              const icons = { info: Blocks, build: Play, chat: MessageSquare };
              const Icon = icons[tab];
              return (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                title={tab}
                className={`flex-1 flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider transition-colors ${
                  rightTab === tab
                    ? 'text-foreground/70 border-b border-foreground/30'
                    : 'text-muted-foreground/30 hover:text-muted-foreground/60'
                }`}>
                <Icon size={11} />
                {tab === 'build' && hasBuild && !buildDone && (
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
                  <div className="p-4 space-y-4">
                    <div className="flex items-center gap-3">
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

                    <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
                      {app.prompt}
                    </p>

                    {app.error && (
                      <div className="p-2.5 bg-red-500/5 rounded">
                        <p className="text-[10px] text-red-400/70 font-mono whitespace-pre-wrap">
                          {app.error}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 bg-white/[0.02] rounded text-[10px]">
                        <span className="text-muted-foreground/40">Files</span>
                        <p className="text-foreground/60 mt-0.5">
                          {files.length}
                        </p>
                      </div>
                      <div className="p-2 bg-white/[0.02] rounded text-[10px]">
                        <span className="text-muted-foreground/40">Route</span>
                        <p className="text-foreground/60 mt-0.5 font-mono">
                          {app.route}
                        </p>
                      </div>
                      {containerStats && (
                        <>
                          <div className="p-2 bg-white/[0.02] rounded text-[10px]">
                            <span className="text-muted-foreground/40">CPU</span>
                            <p className="text-foreground/60 mt-0.5 font-mono">{containerStats.cpu || '—'}</p>
                          </div>
                          <div className="p-2 bg-white/[0.02] rounded text-[10px]">
                            <span className="text-muted-foreground/40">Memory</span>
                            <p className="text-foreground/60 mt-0.5 font-mono text-[9px]">{containerStats.mem || '—'}</p>
                          </div>
                          <div className="p-2 bg-white/[0.02] rounded text-[10px]">
                            <span className="text-muted-foreground/40">Network</span>
                            <p className="text-foreground/60 mt-0.5 font-mono text-[9px]">{containerStats.net || '—'}</p>
                          </div>
                          <div className="p-2 bg-white/[0.02] rounded text-[10px]">
                            <span className="text-muted-foreground/40">PIDs</span>
                            <p className="text-foreground/60 mt-0.5 font-mono">{containerStats.pids || '—'}</p>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex gap-1.5 pt-3 border-t border-border/10">
                      {app.status === 'running' && (
                        <button
                          onClick={() =>
                            window.open(
                              `${API_BASE}/apps/${app.name}/`,
                              '_blank',
                            )
                          }
                          className="flex-1 py-1.5 text-[10px] text-emerald-400/80 bg-emerald-500/5 rounded hover:bg-emerald-500/10 transition-colors">
                          Open <ExternalLink size={10} className="inline" />
                        </button>
                      )}
                      {app.status === 'running' && (
                        <button
                          onClick={() => stopApp(app.name)}
                          className="py-1.5 px-3 text-[10px] text-muted-foreground/50 hover:bg-white/[0.03] rounded transition-colors">
                          Stop
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

                    {/* Action type selector */}
                    <div className="pt-3 border-t border-border/10 space-y-2">
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
                          <Bug size={10} className="inline mr-0.5" /> Bug Report
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={changeInput}
                          onChange={(e) => setChangeInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && changeInput.trim()) {
                              if (actionType === 'feature') {
                                startRebuild(changeInput);
                              } else if (actionType === 'fix') {
                                startFix(changeInput);
                              } else {
                                startFix(changeInput);
                              }
                              setChangeInput('');
                            }
                          }}
                          placeholder={
                            actionType === 'feature'
                              ? 'e.g. add dark mode, change colors...'
                              : actionType === 'fix'
                                ? 'Describe what needs fixing...'
                                : 'Describe the bug you found...'
                          }
                          disabled={building}
                          className="w-full bg-transparent border border-border/15 rounded text-[11px] py-1.5 px-2.5 pr-14 focus:outline-none focus:border-violet-500/40 placeholder:text-muted-foreground/20 transition-colors disabled:opacity-30"
                        />
                        <button
                          onClick={() => {
                            if (actionType === 'feature') {
                              startRebuild(changeInput);
                            } else {
                              startFix(changeInput);
                            }
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
                          {actionType === 'feature' ? 'Rebuild' : 'Fix'}
                        </button>
                      </div>
                      {actionType !== 'feature' && (
                        <button
                          onClick={() => startFix()}
                          disabled={building}
                          className="w-full py-1.5 text-[10px] text-amber-400/80 bg-amber-500/5 border border-amber-500/10 rounded hover:bg-amber-500/10 transition-colors disabled:opacity-30">
                          <Wrench size={10} className="inline mr-0.5" /> Auto-fix from Logs (no description)
                        </button>
                      )}
                    </div>

                    {/* Build History */}
                    {app.builds && app.builds.length > 0 && (
                      <div className="pt-3 border-t border-border/10 space-y-1.5">
                        <button
                          onClick={() => setSettingsOpen((v) => !v)}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/60 w-full">
                          <History size={10} /> Build History ({app.builds.length})
                        </button>
                        <div className="space-y-1 max-h-40 overflow-auto">
                          {[...app.builds].reverse().map((b, i) => (
                            <div key={i} className="flex items-center gap-2 text-[9px] py-0.5">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                              <span className="text-muted-foreground/50 capitalize">{b.action}</span>
                              <span className="text-muted-foreground/30 flex-1 truncate font-mono">{b.prompt}</span>
                              <span className="text-muted-foreground/30 tabular-nums shrink-0">{b.duration}</span>
                            </div>
                          ))}
                        </div>
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
                            <span className="text-[9px] text-muted-foreground/30">Icon</span>
                            <input
                              value={editIcon}
                              onChange={(e) => setEditIcon(e.target.value)}
                              placeholder="emoji..."
                              className="w-full h-6 text-[11px] bg-transparent border border-border/15 rounded px-2 focus:outline-none focus:border-foreground/20"
                            />
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[9px] text-muted-foreground/30">Route</span>
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

                    {deployEvents.length > 0 && (
                      <div className="p-2 bg-white/[0.02] rounded max-h-32 overflow-auto">
                        <EventLog events={deployEvents} />
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

            {/* ── Build tab ── */}
            {rightTab === 'build' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {hasBuild ? (
                  <>
                    <div className="px-3 py-2 border-b border-border/10">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-muted-foreground/40">
                          Pipeline
                        </span>
                        <div className="flex items-center gap-2">
                          {building && (
                            <button
                              onClick={cancelBuild}
                              className="text-[9px] text-red-400/60 hover:text-red-400 transition-colors">
                              Cancel
                            </button>
                          )}
                          {buildDone && (
                            <button
                              onClick={() => setEvents([])}
                              className="text-[9px] text-muted-foreground/30 hover:text-muted-foreground transition-colors">
                              clear
                            </button>
                          )}
                        </div>
                      </div>
                      <PipelineProgress events={events} />
                    </div>
                    <BuildNodeStats building={building} />
                    <div className="flex-1 overflow-auto">
                      <TaskBoard events={events} />
                    </div>
                    {selectedApp && buildDone && (
                      <div className="p-2.5 border-t border-border/10 space-y-1.5">
                        <div className="flex gap-1">
                          <button
                            onClick={() => setActionType('feature')}
                            className={`flex-1 py-0.5 text-[8px] rounded transition-colors ${
                              actionType === 'feature'
                                ? 'text-violet-400 bg-violet-500/10'
                                : 'text-muted-foreground/30 hover:bg-white/[0.03]'
                            }`}>
                            <Sparkles size={9} className="inline mr-0.5" /> Feature
                          </button>
                          <button
                            onClick={() => setActionType('fix')}
                            className={`flex-1 py-0.5 text-[8px] rounded transition-colors ${
                              actionType === 'fix'
                                ? 'text-amber-400 bg-amber-500/10'
                                : 'text-muted-foreground/30 hover:bg-white/[0.03]'
                            }`}>
                            <Wrench size={9} className="inline mr-0.5" /> Fix
                          </button>
                          <button
                            onClick={() => setActionType('bug')}
                            className={`flex-1 py-0.5 text-[8px] rounded transition-colors ${
                              actionType === 'bug'
                                ? 'text-red-400 bg-red-500/10'
                                : 'text-muted-foreground/30 hover:bg-white/[0.03]'
                            }`}>
                            <Bug size={9} className="inline mr-0.5" /> Bug
                          </button>
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            value={changeInput}
                            onChange={(e) => setChangeInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && changeInput.trim()) {
                                if (actionType === 'feature') {
                                  startRebuild(changeInput);
                                } else {
                                  startFix(changeInput);
                                }
                                setChangeInput('');
                              }
                            }}
                            placeholder={
                              actionType === 'feature'
                                ? 'Request a feature...'
                                : actionType === 'fix'
                                  ? 'Describe what to fix...'
                                  : 'Describe the bug...'
                            }
                            className="w-full bg-transparent border-0 border-b border-border/15 text-xs py-1.5 pr-8 focus:outline-none focus:border-violet-500/40 placeholder:text-muted-foreground/25 transition-colors"
                          />
                          <button
                            onClick={() => {
                              if (actionType === 'feature') {
                                startRebuild(changeInput);
                              } else {
                                startFix(changeInput);
                              }
                              setChangeInput('');
                            }}
                            disabled={building || !changeInput.trim()}
                            className={`absolute right-0 top-1/2 -translate-y-1/2 text-[10px] disabled:opacity-20 transition-colors ${
                              actionType === 'feature'
                                ? 'text-violet-400/50 hover:text-violet-400'
                                : 'text-amber-400/50 hover:text-amber-400'
                            }`}>
                            {actionType === 'feature' ? 'Edit' : 'Fix'}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-[10px] text-muted-foreground/20">
                      No build in progress
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Chat tab ── */}
            {rightTab === 'chat' && (
              <div className="flex-1 flex flex-col overflow-hidden">
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
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                        placeholder="Ask about the code..."
                        disabled={chatLoading}
                        className="w-full bg-transparent border-0 border-b border-border/15 text-xs py-1.5 pr-6 focus:outline-none focus:border-blue-500/30 placeholder:text-muted-foreground/25 transition-colors"
                      />
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

interface HKAccessory {
  id: string;
  name: string;
  mac: string;
  host: string;
}

interface HKInfo {
  bridge: string;
  pin: string;
  port: number;
  setup_uri: string;
  accessories: HKAccessory[] | null;
}

function HomeKitPanel() {
  const [info, setInfo] = useState<HKInfo | null>(null);
  const [waking, setWaking] = useState<string | null>(null);
  const [wakeResult, setWakeResult] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/homekit`)
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo(null));
    fetchLogs();
  }, []);

  const fetchLogs = () => {
    fetch(`${API_BASE}/api/logs?n=200`)
      .then((r) => r.json())
      .then((all: LogEntry[]) => {
        const hk = (all || []).filter(
          (l) =>
            l.message.toLowerCase().includes('homekit') ||
            l.message.toLowerCase().includes('hap') ||
            l.message.toLowerCase().includes('bridge') ||
            l.message.toLowerCase().includes('mdns') ||
            l.message.toLowerCase().includes('dnssd'),
        );
        setLogs(hk.reverse());
      })
      .catch(() => setLogs([]));
  };

  const wake = async (id: string, name: string) => {
    setWaking(id);
    setWakeResult((prev) => ({ ...prev, [id]: '' }));
    try {
      const res = await fetch(`${API_BASE}/api/nodes/${id}/wake`, {
        method: 'POST',
      });
      if (res.ok) {
        setWakeResult((prev) => ({ ...prev, [id]: `✓ WoL sent to ${name}` }));
      } else {
        const data = await res.json();
        setWakeResult((prev) => ({
          ...prev,
          [id]: `✗ ${data.error || 'Failed'}`,
        }));
      }
    } catch (e) {
      setWakeResult((prev) => ({
        ...prev,
        [id]: `✗ ${e instanceof Error ? e.message : 'Error'}`,
      }));
    }
    setWaking(null);
  };

  if (!info) {
    return (
      <div className="rounded-lg border border-border/30 p-6 text-center text-sm text-muted-foreground">
        Loading HomeKit bridge info...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bridge info */}
      <div className="rounded-lg border border-border/30 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Home size={18} className="text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{info.bridge}</p>
            <p className="text-[11px] text-muted-foreground">
              HomeKit Bridge · Port {info.port}
            </p>
          </div>
          <code className="ml-auto bg-muted/40 px-2 py-0.5 rounded font-mono text-xs tracking-widest">
            {info.pin}
          </code>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            Setup QR Code (for initial hub pairing only)
          </summary>
          <div className="flex flex-col items-center gap-3 py-3">
            <div className="bg-white p-3 rounded-lg">
              <QRCodeSVG value={info.setup_uri} size={140} level="M" />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Scan with Apple Home to add this bridge for the first time.
              Devices appear automatically after pairing.
            </p>
          </div>
        </details>
      </div>

      {/* Accessories */}
      {info.accessories && info.accessories.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {info.accessories.length} accessori
            {info.accessories.length === 1 ? 'y' : 'es'}
          </p>
          {info.accessories.map((acc) => (
            <div
              key={acc.id}
              className="rounded-lg border border-border/30 p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Monitor size={16} className="text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{acc.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {acc.mac} · {acc.host}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => wake(acc.id, acc.name)}
                  disabled={waking === acc.id}
                  className="px-2.5 py-1 rounded-md text-[11px] text-violet-400 border border-violet-500/20 hover:bg-violet-500/10 disabled:opacity-50 transition-colors">
                  {waking === acc.id ? 'Waking...' : <><Power size={12} className="inline" /> Wake</>}
                </button>
                {wakeResult[acc.id] && (
                  <span
                    className={`text-[10px] ${wakeResult[acc.id].startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
                    {wakeResult[acc.id]}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agent download */}
      <div className="rounded-lg border border-border/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package size={16} className="text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">home-agent.exe</p>
              <p className="text-[10px] text-muted-foreground">
                Windows agent — reports stats & accepts commands
              </p>
            </div>
          </div>
          <a href="/home-agent.exe" download>
            <button className="px-2.5 py-1 rounded-md text-[11px] text-blue-400 border border-blue-500/20 hover:bg-blue-500/10 transition-colors">
              <Download size={12} className="inline mr-0.5" /> Download
            </button>
          </a>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            Setup instructions
          </summary>
          <div className="mt-2 space-y-2 text-[11px] text-muted-foreground leading-relaxed">
            <p>
              <strong className="text-foreground/70">1.</strong> Download and
              run{' '}
              <code className="bg-muted/40 px-1 rounded text-[10px]">
                home-agent.exe
              </code>
            </p>
            <p>
              <strong className="text-foreground/70">2.</strong> If Windows
              blocks it: Properties → Unblock, or disable Smart App Control
            </p>
            <p>
              <strong className="text-foreground/70">3.</strong> It
              auto-installs to startup, detects your PC, connects to server.
              Zero config.
            </p>
            <p className="text-[10px]">
              Uninstall:{' '}
              <code className="bg-muted/40 px-1 rounded">
                home-agent.exe -uninstall
              </code>
            </p>
          </div>
        </details>
      </div>

      {/* Bridge logs */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Bridge Logs</p>
          <button
            onClick={fetchLogs}
            className="text-[11px] text-muted-foreground hover:text-foreground">
            <RefreshCw size={12} />
          </button>
        </div>
        <div className="rounded-lg border border-border/30 overflow-hidden">
          <ScrollArea className="max-h-[250px]">
            {logs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No HomeKit logs
              </p>
            ) : (
              <div className="divide-y divide-border/10">
                {logs.map((l, i) => (
                  <div
                    key={i}
                    className="px-3 py-1 flex gap-2 text-[11px] font-mono">
                    <span className="text-muted-foreground/50 shrink-0 w-[62px] tabular-nums">
                      {l.timestamp
                        ? new Date(l.timestamp).toLocaleTimeString()
                        : ''}
                    </span>
                    <span
                      className={`shrink-0 w-[38px] ${
                        l.level === 'ERROR'
                          ? 'text-red-400'
                          : l.level === 'WARN'
                            ? 'text-amber-400'
                            : 'text-emerald-400/60'
                      }`}>
                      {l.level}
                    </span>
                    <span className="text-foreground/70 break-all">
                      {l.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

/* ── Chat Panel (Streaming with Sessions) ── */

interface ChatAttachment {
  id: string;
  name: string;
  type: string; // mime
  size: number;
  text?: string; // for text-like content
  dataUrl?: string; // for images
}

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  node?: string;
  tier?: string;
  model?: string;
  route?: string;
  latency?: string;
  classifierLatency?: string;
  stepType?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  edited?: boolean;
  attachments?: ChatAttachment[];
  reasoningSteps?: Array<{ kind: string; text: string }>;
  // For branching / regenerate
  parentSessionId?: string;
  branchFromMsgId?: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMsg[];
  updatedAt: number;
  createdAt?: number;
  pinned?: boolean;
  starred?: boolean;
  archived?: boolean;
  system?: string; // persona / system prompt
  modelOverride?: string; // 'auto' | 'light' | 'heavy' | nodeName
  temperature?: number;
  totalPromptTokens?: number;
  totalCompletionTokens?: number;
  parentSessionId?: string;
  branchFromMsgId?: string;
}

interface Persona {
  id: string;
  name: string;
  emoji?: string;
  system: string;
}

const BUILTIN_PERSONAS: Persona[] = [
  { id: 'default', name: 'Default', emoji: '💬', system: '' },
  { id: 'engineer', name: 'Senior Engineer', emoji: '🔧', system: 'You are a senior software engineer. Be concise, pragmatic, and code-first. Prefer trade-off analysis over verbose explanation.' },
  { id: 'tutor', name: 'Patient Tutor', emoji: '🎓', system: 'You are a patient tutor. Explain step-by-step with small examples. Ask one clarifying question if the user\'s goal is ambiguous.' },
  { id: 'editor', name: 'Sharp Editor', emoji: '✍️', system: 'You are a sharp editor. Tighten prose, kill filler, preserve voice. Show before/after when helpful.' },
  { id: 'shell', name: 'Shell Wizard', emoji: '🖥️', system: 'You are a shell expert. Reply with a single fenced bash block plus one sentence of context unless asked otherwise.' },
];

// Cross-panel events for handoff & terminal integration
function gotoPage(page: string, payload?: unknown) {
  window.dispatchEvent(new CustomEvent('nav:goto', { detail: { page, payload } }));
}
function copyToClipboard(text: string) {
  try {
    navigator.clipboard?.writeText(text);
  } catch {
    // ignore
  }
}

// ── Slash commands ──
interface SlashCmd {
  cmd: string;
  hint: string;
  example?: string;
}
const SLASH_COMMANDS: SlashCmd[] = [
  { cmd: '/clear', hint: 'Clear all messages in this chat', example: '/clear' },
  { cmd: '/new', hint: 'Start a new chat session', example: '/new' },
  { cmd: '/system', hint: 'Set system prompt for this chat', example: '/system You are a Rust expert.' },
  { cmd: '/model', hint: 'Override routing for the next turn (auto|light|heavy|<node>)', example: '/model heavy' },
  { cmd: '/temp', hint: 'Set temperature for this chat (0–2)', example: '/temp 0.3' },
  { cmd: '/persona', hint: 'Switch persona by id', example: '/persona engineer' },
  { cmd: '/title', hint: 'Rename this chat', example: '/title Rust ownership notes' },
  { cmd: '/build', hint: 'Send the last assistant reply to the Apps wizard as an idea', example: '/build' },
  { cmd: '/export', hint: 'Download this chat as Markdown', example: '/export' },
  { cmd: '/help', hint: 'Show all slash commands', example: '/help' },
];

// ── Tiny markdown renderer with code-block actions ──
function MarkdownView({ text }: { text: string }) {
  // Split into segments: text + ```fenced``` blocks
  const segments = useMemo(() => {
    const out: Array<{ kind: 'text' | 'code'; lang?: string; body: string }> = [];
    const re = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push({ kind: 'text', body: text.slice(last, m.index) });
      out.push({ kind: 'code', lang: m[1] || '', body: m[2] });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ kind: 'text', body: text.slice(last) });
    return out;
  }, [text]);

  return (
    <div className="space-y-2">
      {segments.map((seg, i) =>
        seg.kind === 'code' ? (
          <CodeBlock key={i} lang={seg.lang || ''} code={seg.body.replace(/\n$/, '')} />
        ) : (
          <InlineMarkdown key={i} text={seg.body} />
        ),
      )}
    </div>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  // Render paragraphs separated by blank lines; handle **bold**, *italic*, `code`, and bullet lists.
  const blocks = text.split(/\n{2,}/).filter((b) => b.length > 0);
  return (
    <>
      {blocks.map((b, i) => {
        const isList = b.split('\n').every((l) => /^\s*[-*]\s+/.test(l));
        if (isList) {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {b.split('\n').map((l, j) => (
                <li key={j} className="text-sm leading-relaxed">
                  <InlineSpans text={l.replace(/^\s*[-*]\s+/, '')} />
                </li>
              ))}
            </ul>
          );
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(b);
        if (heading) {
          const level = heading[1].length;
          const sizes = ['text-base', 'text-base', 'text-sm', 'text-sm', 'text-xs', 'text-xs'];
          return (
            <p key={i} className={`font-semibold ${sizes[level - 1]} text-foreground`}>
              <InlineSpans text={heading[2]} />
            </p>
          );
        }
        return (
          <p key={i} className="text-sm whitespace-pre-wrap leading-relaxed">
            <InlineSpans text={b} />
          </p>
        );
      })}
    </>
  );
}

function InlineSpans({ text }: { text: string }) {
  // Order matters: bold before italic, then inline code
  const parts: Array<{ kind: 'text' | 'code' | 'bold' | 'italic' | 'link'; body: string; href?: string }> = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: 'text', body: text.slice(last, m.index) });
    if (m[2]) parts.push({ kind: 'bold', body: m[2] });
    else if (m[4]) parts.push({ kind: 'italic', body: m[4] });
    else if (m[6]) parts.push({ kind: 'code', body: m[6] });
    else if (m[8]) parts.push({ kind: 'link', body: m[8], href: m[9] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', body: text.slice(last) });
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === 'bold') return <strong key={i} className="font-semibold">{p.body}</strong>;
        if (p.kind === 'italic') return <em key={i}>{p.body}</em>;
        if (p.kind === 'code') return <code key={i} className="px-1 py-px text-[12px] rounded bg-white/10 font-mono">{p.body}</code>;
        if (p.kind === 'link')
          return (
            <a key={i} href={p.href} target="_blank" rel="noreferrer" className="underline text-violet-300 hover:text-violet-200">
              {p.body}
            </a>
          );
        return <span key={i}>{p.body}</span>;
      })}
    </>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const isShell = /^(sh|bash|zsh|console|shell)$/i.test(lang);
  const isDiff = lang.toLowerCase() === 'diff';
  const onCopy = () => {
    copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="rounded-md border border-white/10 bg-black/40 overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 border-b border-white/5 bg-white/[0.02]">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50 font-mono">{lang || 'text'}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onCopy}
            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-muted-foreground/60 hover:text-foreground rounded hover:bg-white/5 transition-colors">
            <Copy size={10} />
            {copied ? 'Copied' : 'Copy'}
          </button>
          {isShell && (
            <button
              onClick={() => copyToClipboard(code)}
              title="Copy command — paste into the bottom Terminal tab"
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-violet-300/70 hover:text-violet-200 rounded hover:bg-white/5 transition-colors">
              <Terminal size={10} />
              Copy as cmd
            </button>
          )}
        </div>
      </div>
      <pre className={`text-[12px] font-mono p-3 overflow-auto leading-relaxed ${isDiff ? 'diff-block' : ''}`}>
        {isDiff
          ? code.split('\n').map((l, i) => {
              const cls = l.startsWith('+') && !l.startsWith('+++')
                ? 'text-emerald-300 bg-emerald-500/5'
                : l.startsWith('-') && !l.startsWith('---')
                  ? 'text-red-300 bg-red-500/5'
                  : l.startsWith('@@')
                    ? 'text-violet-300/70'
                    : 'text-foreground/70';
              return (
                <div key={i} className={`${cls} whitespace-pre`}>
                  {l || ' '}
                </div>
              );
            })
          : <code className="text-foreground/85">{code}</code>}
      </pre>
    </div>
  );
}

// ── Voice input + TTS helpers ──
function useSpeechRecognition(onResult: (text: string) => void) {
  const recRef = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const supported = typeof window !== 'undefined' && (('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window));
  const start = useCallback(() => {
    if (!supported) return;
    const Ctor: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = navigator.language || 'en-US';
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join(' ');
      onResult(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }, [onResult, supported]);
  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
  }, []);
  return { supported, listening, start, stop };
}

function speak(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}
function stopSpeaking() {
  try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
}

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [showSlash, setShowSlash] = useState(false);
  const [showFilter, setShowFilter] = useState<'all' | 'pinned' | 'archived'>('all');
  const [resumeBanner, setResumeBanner] = useState(false);
  const [collapsedReasoning, setCollapsedReasoning] = useState<Record<string, boolean>>({});
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [pendingModel, setPendingModel] = useState<string>(''); // one-shot override
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

  // Persist helpers
  const persist = useCallback((updated: ChatSession[]) => {
    setSessions(updated);
    try {
      localStorage.setItem('chat-sessions', JSON.stringify(updated));
    } catch {
      // ignore (quota)
    }
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
      try { localStorage.setItem('chat-active', s.id); } catch { /* ignore */ }
      setSideOpen(false);
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
          try { localStorage.setItem('chat-active', next); } catch { /* ignore */ }
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
      try { localStorage.removeItem('chat-loading'); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to bottom on new content
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [displayMessages.length, liveSteps.length]);

  // ── Auto-title via /api/chat (light model, non-blocking) ──
  const autoTitle = useCallback(async (sessionId: string, firstUser: string, firstAssistant: string) => {
    try {
      const r = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You write extremely short chat titles. Reply with 2-5 words, no quotes, no punctuation.' },
            { role: 'user', content: `User: ${firstUser}\n\nAssistant: ${firstAssistant.slice(0, 600)}\n\nTitle:` },
          ],
        }),
      });
      if (!r.ok) return;
      const data = await r.json();
      let t = (data?.message?.content || data?.content || '').trim();
      t = t.replace(/^"|"$/g, '').replace(/[.!?]+$/, '');
      if (t && t.length <= 60) {
        setSessions((prev) => {
          const next = prev.map((s) => (s.id === sessionId && s.title.startsWith(firstUser.slice(0, 10)) ? { ...s, title: t } : s));
          try { localStorage.setItem('chat-sessions', JSON.stringify(next)); } catch { /* ignore */ }
          return next;
        });
      }
    } catch {
      // ignore
    }
  }, []);

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
            updateActive((s) => ({ ...s, modelOverride: arg, updatedAt: Date.now() }));
            setStatusMsg(`Routing override → ${arg}`);
          }
          setInput('');
          return true;
        case '/temp': {
          const t = parseFloat(arg);
          if (!isFinite(t) || t < 0 || t > 2) {
            setStatusMsg('Usage: /temp 0.0–2.0');
          } else {
            updateActive((s) => ({ ...s, temperature: t, updatedAt: Date.now() }));
            setStatusMsg(`Temperature → ${t}`);
          }
          setInput('');
          return true;
        }
        case '/persona': {
          const p = personas.find((x) => x.id === arg);
          if (!p) {
            setStatusMsg(`Unknown persona "${arg}". Try: ${personas.map((x) => x.id).join(', ')}`);
          } else {
            updateActive((s) => ({ ...s, system: p.system, updatedAt: Date.now() }));
            setStatusMsg(`Persona → ${p.name}`);
          }
          setInput('');
          return true;
        }
        case '/title':
          if (arg) updateActive((s) => ({ ...s, title: arg, updatedAt: Date.now() }));
          setInput('');
          return true;
        case '/build': {
          const lastA = [...(active?.messages || [])].reverse().find((m) => m.role === 'assistant');
          if (!lastA) {
            setStatusMsg('No assistant reply to send.');
          } else {
            gotoPage('apps', { prompt: lastA.content });
            setStatusMsg('Sent to Apps wizard.');
          }
          setInput('');
          return true;
        }
        case '/export':
          exportSession();
          setInput('');
          return true;
        case '/help':
          setStatusMsg(SLASH_COMMANDS.map((c) => `${c.cmd} — ${c.hint}`).join('\n'));
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
    try { localStorage.removeItem('chat-loading'); } catch { /* ignore */ }
  }, []);

  // ── Export current session as Markdown ──
  function exportSession() {
    if (!active) return;
    const lines: string[] = [`# ${active.title}`, ''];
    if (active.system) lines.push(`> **System:** ${active.system}`, '');
    for (const m of active.messages) {
      if (m.role === 'system') continue;
      lines.push(m.role === 'user' ? '### You' : `### Assistant${m.node ? ` (${m.node})` : ''}`);
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

  // ── Send (used by initial send, regenerate, and resend-from-edit) ──
  const sendWithMessages = useCallback(
    async (newMessages: ChatMsg[], opts?: { titleSeed?: string; modelOverride?: string }) => {
      if (!active) return;
      const sid = active.id;
      // Optimistic update
      const optimistic = sessions.map((s) =>
        s.id === sid ? { ...s, messages: newMessages, updatedAt: Date.now(), title: s.messages.length === 0 && opts?.titleSeed ? opts.titleSeed.slice(0, 40) : s.title } : s,
      );
      persist(optimistic);
      setLoading(true);
      setLiveSteps([]);
      try { localStorage.setItem('chat-loading', '1'); } catch { /* ignore */ }

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const reasoning: Array<{ kind: string; text: string }> = [];

      try {
        const sysMsg = active.system?.trim()
          ? [{ role: 'system' as const, content: active.system.trim() }]
          : [];
        const apiMsgs = [
          ...sysMsg,
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
                reasoning.push({ kind: 'classifying', text: 'Classifying with the router model…' });
                setLiveSteps((p) => [
                  ...p.filter((b) => b.stepType !== 'classifying'),
                  { id: `s-${ts}`, role: 'system', content: 'Classifying…', stepType: 'classifying' },
                ]);
              } else if (ev.step === 'classified') {
                reasoning.push({ kind: 'classified', text: `Routed → ${ev.node || ''} · ${ev.tier || ''}${ev.classifier_latency ? ` · ${ev.classifier_latency}` : ''}` });
                setLiveSteps((p) => [
                  ...p.filter((b) => b.stepType !== 'classifying'),
                  { id: `s-${ts}`, role: 'system', content: `Routed → ${ev.node} · ${ev.tier}${ev.classifier_latency ? ` · ${ev.classifier_latency}` : ''}`, stepType: 'classified', node: ev.node, tier: ev.tier },
                ]);
              } else if (ev.step === 'generating') {
                reasoning.push({ kind: 'generating', text: `Generating on ${ev.node}…` });
                setLiveSteps((p) => [
                  ...p,
                  { id: `s-${ts}`, role: 'system', content: `Generating on ${ev.node}…`, stepType: 'generating', node: ev.node },
                ]);
              } else if (ev.step === 'searching') {
                reasoning.push({ kind: 'searching', text: 'Searching the web…' });
                setLiveSteps((p) => [
                  ...p,
                  { id: `s-${ts}`, role: 'system', content: 'Searching the web…', stepType: 'searching' },
                ]);
              } else if (ev.step === 'search_done') {
                reasoning.push({ kind: 'search_done', text: ev.message || 'Search complete' });
                setLiveSteps((p) => [
                  ...p.filter((b) => b.stepType !== 'searching'),
                  { id: `s-${ts}`, role: 'system', content: `🔍 ${ev.message || 'Search complete'}`, stepType: 'search_done' },
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
          const latest = sessions.map((s) => (s.id === sid ? { ...s, messages: newMessages, updatedAt: Date.now() } : s));
          persist(latest);
        } else {
          setLiveSteps([]);
          const errMsg: ChatMsg = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `Error: ${e instanceof Error ? e.message : 'Failed'}`,
            stepType: 'error',
          };
          persist(sessions.map((s) => (s.id === sid ? { ...s, messages: [...newMessages, errMsg] } : s)));
        }
      } finally {
        abortRef.current = null;
        setLoading(false);
        try { localStorage.removeItem('chat-loading'); } catch { /* ignore */ }
      }
    },
    [active, sessions, persist, autoTitle],
  );

  // ── Composer send ──
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || !active) return;
    if (text.startsWith('/')) {
      if (runSlash(text)) return;
    }
    const userMsg: ChatMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      attachments: attachments.length ? attachments : undefined,
    };
    let composed = text;
    if (attachments.length) {
      const parts = attachments
        .filter((a) => a.text)
        .map((a) => `\n\n--- Attached: ${a.name} (${a.type}) ---\n${a.text}\n--- end ---`)
        .join('');
      if (parts) composed = `${text}${parts}`;
    }
    const newMessages = [...active.messages, { ...userMsg, content: composed }];
    const titleSeed = active.messages.length === 0 ? text : undefined;
    setInput('');
    setAttachments([]);
    const oneShot = pendingModel;
    setPendingModel('');
    await sendWithMessages(newMessages, { titleSeed, modelOverride: oneShot || undefined });
  }, [input, loading, active, attachments, pendingModel, runSlash, sendWithMessages]);

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
    const replaced: ChatMsg = { ...active.messages[idx], content: editingText, edited: true };
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
  const togglePin = (id: string) => persist(sessions.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)));
  const toggleStar = (id: string) => persist(sessions.map((s) => (s.id === id ? { ...s, starred: !s.starred } : s)));
  const toggleArchive = (id: string) => persist(sessions.map((s) => (s.id === id ? { ...s, archived: !s.archived } : s)));

  // ── Voice input ──
  const { supported: micSupported, listening, start: micStart, stop: micStop } = useSpeechRecognition((t) => {
    setInput((prev) => (prev ? prev + ' ' + t : t));
  });
  const [ttsOn, setTtsOn] = useState<boolean>(() => {
    try { return localStorage.getItem('chat-tts') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('chat-tts', ttsOn ? '1' : '0'); } catch { /* ignore */ }
  }, [ttsOn]);
  // Speak final assistant content when it appears
  const lastSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ttsOn || !active) return;
    const last = active.messages[active.messages.length - 1];
    if (last && last.role === 'assistant' && last.id !== lastSpokenRef.current) {
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
        items.push({ id, name: f.name, type: f.type || 'text/plain', size: f.size, text });
      } else {
        setStatusMsg(`Skipped ${f.name} (>200KB and not an image)`);
      }
    }
    setAttachments((prev) => [...prev, ...items]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const onPasteCompose = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items || []);
    const files = items.map((i) => i.getAsFile()).filter(Boolean) as File[];
    if (files.length) {
      e.preventDefault();
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      onFiles(dt.files);
      return;
    }
    // Auto-detect URL paste → ask to fetch
    const txt = e.clipboardData?.getData('text') || '';
    const m = /^https?:\/\/\S+$/.exec(txt.trim());
    if (m && !input) {
      // do nothing automatic; just let it land in input
    }
  };

  // ── Mention helpers (@app, @node) ──
  const [appsList, setAppsList] = useState<AppInfo[]>([]);
  const [nodesList, setNodesList] = useState<Array<{ name: string; tier?: string }>>([]);
  useEffect(() => {
    fetch(`${API_BASE}/api/apps`).then((r) => r.json()).then((d) => Array.isArray(d) && setAppsList(d)).catch(() => {});
    fetch(`${API_BASE}/api/nodes`).then((r) => r.json()).then((d) => Array.isArray(d) && setNodesList(d.map((n: NodeConfig) => ({ name: n.name, tier: n.tier })))).catch(() => {});
  }, []);
  const mentionState = useMemo(() => {
    const m = /(^|\s)@([a-zA-Z0-9_-]*)$/.exec(input);
    if (!m) return null;
    const q = m[2].toLowerCase();
    const apps = appsList.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 5).map((a) => ({ kind: 'app' as const, name: a.name }));
    const nodes = nodesList.filter((n) => n.name.toLowerCase().includes(q)).slice(0, 5).map((n) => ({ kind: 'node' as const, name: n.name }));
    return { items: [...apps, ...nodes], replaceLen: m[0].length - (m[1].length || 0) };
  }, [input, appsList, nodesList]);
  const insertMention = (name: string) => {
    setInput((prev) => prev.replace(/(^|\s)@[a-zA-Z0-9_-]*$/, (_full, lead) => `${lead}@${name} `));
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

  const filteredSessions = useMemo(() => {
    let arr = sessions.slice();
    if (showFilter === 'pinned') arr = arr.filter((s) => s.pinned);
    else if (showFilter === 'archived') arr = arr.filter((s) => s.archived);
    else arr = arr.filter((s) => !s.archived);
    arr.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);
    return arr;
  }, [sessions, showFilter]);

  const sessionTokens = active
    ? (active.totalPromptTokens || 0) + (active.totalCompletionTokens || 0)
    : 0;

  const lastUserMsg = active ? [...active.messages].reverse().find((m) => m.role === 'user') : null;

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
        className={`${sideOpen ? 'w-64' : 'w-0'} transition-all overflow-hidden border-r border-border/20 bg-muted/10 shrink-0 flex flex-col`}>
        <div className="p-2 space-y-1 flex flex-col h-full">
          <Button size="sm" variant="outline" onClick={() => newSession()} className="w-full text-xs mb-1">
            <Plus size={12} /> New Chat
          </Button>
          <div className="flex gap-1 text-[10px]">
            {(['all', 'pinned', 'archived'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setShowFilter(f)}
                className={`flex-1 py-1 rounded transition-colors ${showFilter === f ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground/60 hover:bg-white/5'}`}>
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-muted-foreground/60 border border-border/20 rounded hover:bg-white/5 transition-colors">
            <Search size={11} />
            Search… <span className="ml-auto text-[9px] opacity-50">⌘K</span>
          </button>
          <div className="flex-1 overflow-auto -mx-2 px-2 mt-1 space-y-0.5">
            {filteredSessions.map((s) => (
              <div
                key={s.id}
                className={`group flex items-center gap-1 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${s.id === activeId ? 'bg-muted/50 text-foreground' : 'text-muted-foreground hover:bg-muted/30'}`}
                onClick={() => {
                  setActiveId(s.id);
                  try { localStorage.setItem('chat-active', s.id); } catch { /* ignore */ }
                }}>
                {s.pinned && <Pin size={9} className="text-violet-400 shrink-0" />}
                {s.starred && <Star size={9} className="text-amber-400 shrink-0" />}
                <span className="truncate flex-1">{s.title || 'Untitled'}</span>
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                  <button
                    title={s.pinned ? 'Unpin' : 'Pin'}
                    onClick={(e) => { e.stopPropagation(); togglePin(s.id); }}
                    className="p-0.5 text-muted-foreground/60 hover:text-violet-300">
                    <Pin size={10} />
                  </button>
                  <button
                    title={s.archived ? 'Unarchive' : 'Archive'}
                    onClick={(e) => { e.stopPropagation(); toggleArchive(s.id); }}
                    className="p-0.5 text-muted-foreground/60 hover:text-foreground">
                    <Archive size={10} />
                  </button>
                  <button
                    title="Delete"
                    onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${s.title}"?`)) deleteSession(s.id); }}
                    className="p-0.5 text-red-400 hover:text-red-300">
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            ))}
            {filteredSessions.length === 0 && (
              <div className="text-[10px] text-muted-foreground/40 italic px-2 py-2">No sessions.</div>
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
              <button onClick={exportSession} title="Export as Markdown" className="p-1 rounded hover:bg-white/5 text-muted-foreground/60 hover:text-foreground">
                <Download size={12} />
              </button>
              <button
                onClick={() => setTtsOn((v) => { if (v) stopSpeaking(); return !v; })}
                title={ttsOn ? 'Disable speech' : 'Speak replies'}
                className={`p-1 rounded hover:bg-white/5 ${ttsOn ? 'text-violet-300' : 'text-muted-foreground/40'}`}>
                <Volume2 size={12} />
              </button>
              {sessionTokens > 0 && (
                <span className="text-[10px] text-muted-foreground/50 font-mono ml-1">{sessionTokens} tok</span>
              )}
            </>
          )}
        </div>

        {/* Resume banner */}
        {resumeBanner && (
          <div className="px-4 py-2 text-[11px] bg-amber-500/10 border-b border-amber-500/20 text-amber-200/90 flex items-center justify-between">
            <span>The previous request was interrupted. The reply may be missing.</span>
            <button onClick={() => setResumeBanner(false)} className="text-amber-200/70 hover:text-amber-100">
              <X size={12} />
            </button>
          </div>
        )}

        {/* System prompt editor */}
        {systemEditOpen && active && (
          <div className="px-4 py-3 border-b border-border/20 bg-white/[0.02] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">System prompt / persona</span>
              <div className="flex items-center gap-1">
                {personas.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => updateActive((s) => ({ ...s, system: p.system }))}
                    title={p.name}
                    className="text-[10px] px-2 py-0.5 rounded border border-border/30 text-muted-foreground/70 hover:text-foreground hover:bg-white/5">
                    {p.emoji} {p.name}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={active.system || ''}
              onChange={(e) => updateActive((s) => ({ ...s, system: e.target.value }))}
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
                onChange={(e) => updateActive((s) => ({ ...s, temperature: parseFloat(e.target.value) }))}
                className="w-16 bg-black/30 border border-white/10 rounded px-1 py-0.5 text-foreground/80 font-mono"
              />
              <label className="text-muted-foreground/60 ml-2">Default route</label>
              <select
                value={active.modelOverride || 'auto'}
                onChange={(e) => updateActive((s) => ({ ...s, modelOverride: e.target.value }))}
                className="bg-black/30 border border-white/10 rounded px-1 py-0.5 text-foreground/80">
                <option value="auto">auto</option>
                <option value="light">light</option>
                <option value="heavy">heavy</option>
                {nodesList.map((n) => (
                  <option key={n.name} value={n.name}>{n.name}</option>
                ))}
              </select>
              <span className="ml-auto text-muted-foreground/40">Saved per chat</span>
            </div>
          </div>
        )}

        {/* Messages — centered column */}
        <div ref={messagesScrollRef} className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
            {displayMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
                <p className="text-sm text-muted-foreground/50">
                  Send a message to start chatting
                </p>
                <div className="flex flex-wrap gap-1.5 justify-center max-w-md">
                  {SLASH_COMMANDS.slice(0, 6).map((c) => (
                    <button
                      key={c.cmd}
                      onClick={() => { setInput(c.cmd + ' '); setTimeout(() => inputRef.current?.focus(), 0); }}
                      className="text-[10px] px-2 py-1 rounded border border-border/30 text-muted-foreground/60 hover:text-foreground hover:bg-white/5 font-mono">
                      {c.cmd}
                    </button>
                  ))}
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
                  while (j < displayMessages.length && (displayMessages[j].role === 'system' || displayMessages[j].stepType)) {
                    group.push(displayMessages[j]);
                    j++;
                  }
                  const groupKey = `g-${group[0].id}`;
                  const collapsed = collapsedReasoning[groupKey] ?? group.length > 2;
                  out.push(
                    <div key={groupKey} className="text-[11px]">
                      <button
                        onClick={() => setCollapsedReasoning((p) => ({ ...p, [groupKey]: !collapsed }))}
                        className="flex items-center gap-1 text-muted-foreground/50 hover:text-muted-foreground/80">
                        {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
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
                              <span className="text-muted-foreground">{g.content}</span>
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
                            rows={Math.min(6, Math.max(2, editingText.split('\n').length))}
                            className="w-full bg-black/30 border border-violet-400/40 rounded p-2 text-sm text-foreground focus:outline-none resize-none"
                          />
                          <div className="flex justify-end gap-1">
                            <button onClick={cancelEdit} className="text-[10px] px-2 py-1 text-muted-foreground hover:text-foreground">
                              Cancel
                            </button>
                            <button onClick={saveEditAndResend} className="text-[10px] px-2 py-1 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/30 rounded text-violet-100">
                              Save & resend
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-foreground/10 rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[85%] relative">
                          <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                          {m.attachments && m.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {m.attachments.map((a) => (
                                <span key={a.id} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-foreground/70">
                                  📎 {a.name}
                                </span>
                              ))}
                            </div>
                          )}
                          {m.edited && <span className="text-[9px] text-muted-foreground/40 ml-1">(edited)</span>}
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
                const reasoning = m.reasoningSteps && m.reasoningSteps.length > 1;
                const reasoningKey = `r-${m.id}`;
                const reasoningCollapsed = collapsedReasoning[reasoningKey] ?? true;
                out.push(
                  <div key={m.id} className="flex justify-start group">
                    <div className="rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[85%] space-y-2 w-full">
                      {reasoning && (
                        <div className="text-[10px]">
                          <button
                            onClick={() => setCollapsedReasoning((p) => ({ ...p, [reasoningKey]: !reasoningCollapsed }))}
                            className="flex items-center gap-1 text-muted-foreground/50 hover:text-muted-foreground/80">
                            {reasoningCollapsed ? <ChevronRight size={9} /> : <ChevronDown size={9} />}
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
                      <MarkdownView text={m.content} />
                      {/* Trace strip */}
                      {(m.node || m.latency) && (
                        <div className="flex flex-wrap gap-2 pt-1 items-center text-[10px] text-muted-foreground/60">
                          {m.node && <span className="text-violet-400/80">{m.node}</span>}
                          {m.tier && <span className="opacity-60">· {m.tier}</span>}
                          {m.model && <span className="font-mono opacity-60">· {m.model}</span>}
                          {m.latency && <span>· {m.latency}</span>}
                          {m.classifierLatency && <span>· cls {m.classifierLatency}</span>}
                          {m.totalTokens != null && m.totalTokens > 0 && (
                            <span className="font-mono">· {m.promptTokens}→{m.completionTokens} ({m.totalTokens} tok)</span>
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
                              onClick={() => branchFrom(m.id)}
                              title="Branch from here"
                              className="p-0.5 hover:text-foreground">
                              <GitBranch size={10} />
                            </button>
                            <button
                              onClick={() => speak(m.content)}
                              title="Speak"
                              className="p-0.5 hover:text-foreground">
                              <Volume2 size={10} />
                            </button>
                            <button
                              onClick={() => gotoPage('apps', { prompt: m.content })}
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

        {/* Status / slash menu / mention menu */}
        {statusMsg && (
          <div className="px-4 py-1 text-[11px] text-muted-foreground/70 border-t border-border/10 bg-white/[0.02] flex items-start gap-2 max-w-3xl mx-auto w-full">
            <span className="whitespace-pre-wrap flex-1">{statusMsg}</span>
            <button onClick={() => setStatusMsg(null)} className="text-muted-foreground/40 hover:text-foreground">
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
                  <span key={a.id} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-white/10 text-foreground/80">
                    📎 {a.name}
                    <button
                      onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))}
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
                <span className="px-2 py-0.5 rounded bg-violet-500/15 border border-violet-400/30 text-violet-200">{pendingModel}</span>
                <button onClick={() => setPendingModel('')} className="text-muted-foreground/60 hover:text-foreground">
                  <X size={10} />
                </button>
              </div>
            )}

            <div className="flex gap-2 items-end">
              <button
                onClick={onPickFiles}
                title="Attach file"
                disabled={loading}
                className="p-2 text-muted-foreground/60 hover:text-foreground rounded hover:bg-white/5 disabled:opacity-30">
                <Plus size={14} />
              </button>
              {micSupported && (
                <button
                  onClick={() => (listening ? micStop() : micStart())}
                  title={listening ? 'Stop listening' : 'Voice input'}
                  className={`p-2 rounded hover:bg-white/5 ${listening ? 'text-red-400 animate-pulse' : 'text-muted-foreground/60 hover:text-foreground'}`}>
                  <Mic size={14} />
                </button>
              )}
              <select
                value={pendingModel}
                onChange={(e) => setPendingModel(e.target.value)}
                title="Override route for next turn"
                className="text-[10px] bg-black/30 border border-border/30 rounded px-1 py-1 text-muted-foreground/70 focus:outline-none focus:text-foreground">
                <option value="">auto</option>
                <option value="light">light</option>
                <option value="heavy">heavy</option>
                {nodesList.map((n) => (
                  <option key={n.name} value={n.name}>{n.name}</option>
                ))}
              </select>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={onPasteCompose}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey || !e.altKey)) {
                    if (!e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  } else if (e.key === 'ArrowUp' && !input && lastUserMsg) {
                    e.preventDefault();
                    startEdit(lastUserMsg);
                  } else if (e.key === 'Tab' && mentionState && mentionState.items.length > 0) {
                    e.preventDefault();
                    insertMention(mentionState.items[0].name);
                  }
                }}
                placeholder={loading ? 'Generating… press Esc to stop' : 'Message…   /  for commands,  @  to mention,  ⌘↵ to send'}
                rows={Math.min(6, Math.max(1, input.split('\n').length))}
                className="flex-1 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
              {loading ? (
                <Button onClick={stop} size="sm" variant="destructive" className="px-3" title="Stop (Esc)">
                  <Square size={14} />
                </Button>
              ) : (
                <Button onClick={send} disabled={!input.trim() && attachments.length === 0} size="sm" className="px-3" title="Send (⌘↵)">
                  <Send size={14} />
                </Button>
              )}
            </div>

            {/* Slash menu */}
            {showSlash && (
              <div className="absolute bottom-full left-3 right-3 mb-2 max-w-3xl mx-auto bg-[#0a0a0a] border border-white/10 rounded-lg shadow-xl overflow-hidden z-10">
                {SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input.split(' ')[0]) || input === '/').map((c) => (
                  <button
                    key={c.cmd}
                    onClick={() => { setInput(c.cmd + ' '); setTimeout(() => inputRef.current?.focus(), 0); setShowSlash(false); }}
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
                    <span className={`text-[9px] uppercase tracking-wider ${it.kind === 'app' ? 'text-blue-300/70' : 'text-amber-300/70'}`}>{it.kind}</span>
                    <span className="font-mono text-foreground">@{it.name}</span>
                    <span className="ml-auto text-[9px] text-muted-foreground/40">↹ Tab</span>
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
            try { localStorage.setItem('chat-active', id); } catch { /* ignore */ }
            setSearchOpen(false);
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* Persona library trigger (subtle) */}
      <PersonaQuickAdd personas={personas} onSave={persistPersonas} />
    </div>
  );
}

function SearchPalette(props: {
  sessions: ChatSession[];
  query: string;
  setQuery: (v: string) => void;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { sessions, query, setQuery, onPick, onClose } = props;
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions.slice(0, 30).sort((a, b) => b.updatedAt - a.updatedAt);
    const out: Array<{ session: ChatSession; snippet: string; score: number }> = [];
    for (const s of sessions) {
      const titleHit = s.title.toLowerCase().includes(q);
      let snippet = '';
      let score = titleHit ? 100 : 0;
      for (const m of s.messages) {
        if (m.role === 'system') continue;
        const idx = m.content.toLowerCase().indexOf(q);
        if (idx !== -1) {
          score += 10;
          if (!snippet) {
            const start = Math.max(0, idx - 30);
            snippet = (start > 0 ? '…' : '') + m.content.slice(start, idx + q.length + 60).replace(/\n/g, ' ');
          }
        }
      }
      if (score > 0) out.push({ session: s, snippet: snippet || s.title, score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 30).map((r) => ({ ...r.session, _snippet: r.snippet } as ChatSession & { _snippet?: string }));
  }, [sessions, query]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-24" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-[640px] max-w-[92vw] bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
          <Search size={12} className="text-muted-foreground/60" />
          <input
            ref={ref}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && results[0]) onPick(results[0].id);
            }}
            placeholder="Search chats and messages…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
          />
          <span className="text-[10px] text-muted-foreground/40">Esc</span>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          {results.length === 0 && (
            <div className="px-3 py-6 text-center text-[12px] text-muted-foreground/40">No matches</div>
          )}
          {results.map((s) => (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              className="w-full text-left px-3 py-2 hover:bg-white/5 border-b border-white/5">
              <div className="text-[12px] text-foreground/90 truncate">{s.title}</div>
              {(s as ChatSession & { _snippet?: string })._snippet && (
                <div className="text-[10px] text-muted-foreground/60 truncate">{(s as ChatSession & { _snippet?: string })._snippet}</div>
              )}
              <div className="text-[9px] text-muted-foreground/40 font-mono">{new Date(s.updatedAt).toLocaleString()}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PersonaQuickAdd({ personas, onSave }: { personas: Persona[]; onSave: (arr: Persona[]) => void }) {
  // hidden helper that listens for a custom event to add a persona; keeps the panel small.
  useEffect(() => {
    const onAdd = (e: Event) => {
      const detail = (e as CustomEvent).detail as Persona | undefined;
      if (!detail || !detail.id || !detail.name) return;
      if (personas.some((p) => p.id === detail.id)) return;
      onSave([...personas, detail]);
    };
    window.addEventListener('chat:persona-add', onAdd as EventListener);
    return () => window.removeEventListener('chat:persona-add', onAdd as EventListener);
  }, [personas, onSave]);
  return null;
}

/* ── Settings Panel (Config + Node CRUD) ── */

interface NodeConfig {
  id: string;
  name: string;
  host: string;
  tier: string;
  gpu?: string;
  mac?: string;
  model?: string;
  online?: boolean;
  temperature?: number | null;
}

const PROMPT_META: Record<string, { label: string; desc: string; vars: string }> = {
  build: {
    label: 'Build (New App)',
    desc: 'Base system prompt sent to aider when creating a new app. Defines the scaffold, rules, and coding conventions.',
    vars: 'No template variables — appended with the user prompt and port.',
  },
  rebuild: {
    label: 'Rebuild (Change Request)',
    desc: 'Sent to aider when applying changes to an existing app.',
    vars: '{{change}} — the user\'s change request, {{port}} — the app port.',
  },
  fix: {
    label: 'Fix (With User Report)',
    desc: 'Sent to aider when fixing errors with a user-provided description.',
    vars: '{{description}} — user report, {{logs}} — container logs, {{port}} — the app port.',
  },
  fixAuto: {
    label: 'Fix (Auto)',
    desc: 'Sent to aider when auto-fixing errors without a user description.',
    vars: '{{logs}} — container logs, {{port}} — the app port.',
  },
  clarify: {
    label: 'Clarify (AI Wizard)',
    desc: 'Sent to the planner LLM (Claude or LM Studio) to generate clarifying questions before a new app is built. Must instruct the model to return strict JSON.',
    vars: '{{prompt}} — the original user idea.',
  },
};

function PromptsEditor({
  prompts,
  onLoad,
  onChange,
  onSave,
  onReset,
  saving,
  dirty,
}: {
  prompts: Record<string, string>;
  onLoad: () => void;
  onChange: (key: string, val: string) => void;
  onSave: () => void;
  onReset: () => void;
  saving: boolean;
  dirty: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    onLoad();
  }, [onLoad]);

  const keys = Object.keys(PROMPT_META);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground/80">System Prompts</h3>
          <p className="text-[11px] text-muted-foreground/50 mt-0.5">
            Edit the prompts sent to aider during build, rebuild, and fix phases.
            Use template variables like {'{{port}}'} that get replaced at runtime.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onReset}
            disabled={saving}
            className="px-3 py-1.5 text-[11px] text-muted-foreground/50 hover:text-foreground/70 border border-border/20 rounded-md hover:bg-muted/20 transition-colors disabled:opacity-30">
            Reset Defaults
          </button>
          <button
            onClick={onSave}
            disabled={saving || !dirty}
            className="px-3 py-1.5 text-[11px] text-foreground/80 bg-foreground/10 hover:bg-foreground/15 rounded-md transition-colors disabled:opacity-30">
            {saving ? 'Saving...' : dirty ? 'Save Changes' : 'Saved'}
          </button>
        </div>
      </div>

      {keys.map((key) => {
        const meta = PROMPT_META[key];
        const isOpen = expanded === key;
        const value = prompts[key] || '';
        const lines = value.split('\n').length;
        return (
          <div key={key} className="rounded-lg border border-border/20 overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : key)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/10 transition-colors text-left">
              <div>
                <span className="text-sm font-medium text-foreground/70">{meta.label}</span>
                <p className="text-[10px] text-muted-foreground/40 mt-0.5">{meta.desc}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[9px] text-muted-foreground/30 tabular-nums">{lines} lines</span>
                <ChevronDown
                  size={14}
                  className={`text-muted-foreground/30 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-border/10 p-3 space-y-2">
                <div className="flex items-center gap-2 text-[9px] text-muted-foreground/30">
                  <span>Variables:</span>
                  <code className="bg-muted/20 px-1.5 py-0.5 rounded">{meta.vars}</code>
                </div>
                <textarea
                  value={value}
                  onChange={(e) => onChange(key, e.target.value)}
                  rows={Math.min(Math.max(lines + 2, 8), 30)}
                  spellCheck={false}
                  className="w-full bg-black/20 text-[11px] font-mono text-foreground/70 leading-relaxed p-3 rounded-md border border-border/10 focus:outline-none focus:border-foreground/20 resize-y"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SettingsCard({ title, icon, actions, children }: {
  title: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/30 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/10 bg-white/[0.01]">
        <div className="flex items-center gap-1.5 text-[11px] text-foreground/80 font-medium">
          {icon && <span className="text-muted-foreground/60">{icon}</span>}
          {title}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function SkeletonRows({ rows = 3, block = false }: { rows?: number; block?: boolean }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`rounded ${block ? 'h-12' : 'h-3'} bg-white/[0.04]`}
          style={{ width: block ? '100%' : `${60 + ((i * 17) % 30)}%` }}
        />
      ))}
    </div>
  );
}

function InfoRow({ label, value, mono, full, valueClass }: {
  label: string;
  value: string;
  mono?: boolean;
  full?: boolean;
  valueClass?: string;
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${full ? 'col-span-2' : ''}`}>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40">{label}</span>
      <span
        className={`text-[11px] truncate ${mono ? 'font-mono' : ''} ${valueClass || 'text-foreground/80'}`}
        title={value}>
        {value}
      </span>
    </div>
  );
}

function ToggleRow({ label, hint, value, onChange, disabled }: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 ${disabled ? 'opacity-40' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`mt-0.5 relative w-8 h-4 rounded-full transition-colors shrink-0 ${
          value ? 'bg-emerald-500/50' : 'bg-white/10'
        } disabled:cursor-not-allowed`}>
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-foreground/80">{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground/50 mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

function NumberRow({ label, hint, value, onChange, step, min, max, suffix }: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-foreground/80">{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground/50 mt-0.5">{hint}</div>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) onChange(n);
          }}
          className="w-16 h-7 text-[11px] tabular-nums text-right rounded-md border border-border/30 bg-transparent px-2 focus:outline-none focus:ring-1 focus:ring-ring/30"
        />
        {suffix && <span className="text-[10px] text-muted-foreground/50">{suffix}</span>}
      </div>
    </div>
  );
}

function SettingsPanel() {
  const [tab, setTab] = useState<'general' | 'nodes' | 'homekit' | 'api' | 'prompts'>(
    'general',
  );
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
      const res = await fetch(`${API_BASE}/api/prompts/reset`, { method: 'POST' });
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
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load'))
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

  const updateSetting = <K extends keyof RuntimeSettings>(k: K, v: RuntimeSettings[K]) => {
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
      const res = await fetch(`${API_BASE}/api/settings/reset`, { method: 'POST' });
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
              {loading ? 'Loading…' : sysCfg ? `home-server ${sysCfg.version} · uptime ${formatUptime(sysCfg.uptime_seconds)}` : 'Configuration'}
            </p>
            <button
              onClick={() => { refresh(); refreshSettings(); }}
              disabled={loading || settingsLoading}
              className="text-[10px] flex items-center gap-1 px-2 py-1 text-muted-foreground/50 hover:text-foreground/80 disabled:opacity-30 transition-colors">
              <RefreshCw size={10} className={(loading || settingsLoading) ? 'animate-spin' : ''} />
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
                <InfoRow label="Started" value={new Date(sysCfg.started_at).toLocaleString()} />
                <InfoRow label="Uptime" value={formatUptime(sysCfg.uptime_seconds)} />
                <InfoRow label="Apps" value={String(sysCfg.apps_count)} />
                <InfoRow label="Nodes" value={String(sysCfg.nodes_count)} />
                <InfoRow label="Data dir" value={sysCfg.data_dir} mono full />
                <InfoRow label="Log dir" value={sysCfg.log_dir} mono full />
                <InfoRow label="HomeKit PIN" value={sysCfg.homekit_pin} mono />
                <InfoRow
                  label="Anthropic key"
                  value={sysCfg.anthropic_set ? 'configured' : 'not set'}
                  valueClass={sysCfg.anthropic_set ? 'text-emerald-400/80' : 'text-muted-foreground/50'}
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
                  <span className={`w-2 h-2 rounded-full ${ollamaOnline ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
                  <span className="text-sm font-medium">Ollama</span>
                  <span className="text-[11px] text-muted-foreground">{ollamaOnline ? 'Online' : 'Offline'}</span>
                  <span className="text-[10px] text-muted-foreground/50 ml-auto font-mono">{ollamaHost}</span>
                </div>
                <div className="space-y-1.5 pt-3 border-t border-border/10">
                  <label className="text-[11px] text-muted-foreground">Router Model (Ollama classifier)</label>
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
                  step={0.1} min={0} max={2}
                  onChange={(v) => updateSetting('defaultTemperature', v)}
                />
                <NumberRow
                  label="Build timeout"
                  hint="Hard cap on how long a single build pipeline run may take, in minutes"
                  value={settings.buildTimeoutMin}
                  step={1} min={1} max={240} suffix="min"
                  onChange={(v) => updateSetting('buildTimeoutMin', v)}
                />
                <NumberRow
                  label="Keep build history"
                  hint="Number of past builds retained per app"
                  value={settings.keepBuildHistory}
                  step={1} min={1} max={200} suffix="entries"
                  onChange={(v) => updateSetting('keepBuildHistory', v)}
                />
              </div>
            )}
          </SettingsCard>

          {/* ── About card ── */}
          <SettingsCard title="About" icon={<Blocks size={12} />}>
            <div className="space-y-2 text-[11px] text-muted-foreground/70">
              <p>
                <span className="text-foreground/80">home-server</span> — a self-hosted dashboard that turns natural-language prompts into running web apps on your Raspberry Pi.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <a href="https://github.com/acanturgut/home-server" target="_blank" rel="noreferrer"
                   className="text-[10px] text-blue-400/80 hover:text-blue-300 inline-flex items-center gap-1">
                  <ExternalLink size={9} /> GitHub
                </a>
                <a href={`${API_BASE}/api/health`} target="_blank" rel="noreferrer"
                   className="text-[10px] text-blue-400/80 hover:text-blue-300 inline-flex items-center gap-1">
                  <ExternalLink size={9} /> /api/health
                </a>
                <a href={`${API_BASE}/api/system`} target="_blank" rel="noreferrer"
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
              {loading ? 'Loading nodes…' : `${nodes.length} node${nodes.length !== 1 ? 's' : ''} configured`}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={refresh}
                disabled={loading}
                className="text-[10px] flex items-center gap-1 px-2 py-1 text-muted-foreground/50 hover:text-foreground/80 disabled:opacity-30 transition-colors">
                <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
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
                {showAdd ? <><X size={11} className="inline" /> Cancel</> : '+ Add Node'}
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
function NodeFormInline({
  form,
  setForm,
  models,
  nodeId,
  online,
}: {
  form: {
    name: string;
    host: string;
    tier: string;
    gpu: string;
    mac: string;
    model: string;
    temperature: number;
  };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
  models: string[];
  nodeId?: string;
  online?: boolean;
}) {
  const [loadingModel, setLoadingModel] = useState<string | null>(null);
  const [localModels, setLocalModels] = useState<string[]>(models);

  useEffect(() => {
    setLocalModels(models);
  }, [models]);

  const loadModel = async (model: string) => {
    if (!nodeId) return;
    setLoadingModel(model);
    try {
      const res = await fetch(`${API_BASE}/api/nodes/${nodeId}/models/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      if (res.ok) setLocalModels((prev) => [...new Set([...prev, model])]);
    } catch {}
    setLoadingModel(null);
  };

  const unloadModel = async (model: string) => {
    if (!nodeId) return;
    setLoadingModel(model);
    try {
      await fetch(`${API_BASE}/api/nodes/${nodeId}/models/unload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      setLocalModels((prev) => prev.filter((m) => m !== model));
    } catch {}
    setLoadingModel(null);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { key: 'name', label: 'Name', placeholder: 'My PC' },
          {
            key: 'host',
            label: 'Host',
            placeholder: 'http://192.168.50.100:1234',
          },
          { key: 'gpu', label: 'GPU', placeholder: 'RTX 4090' },
          { key: 'mac', label: 'MAC', placeholder: 'AA:BB:CC:DD:EE:FF' },
        ].map((f) => (
          <div key={f.key} className="space-y-0.5">
            <label className="text-[10px] text-muted-foreground/60">
              {f.label}
            </label>
            <input
              value={(form as any)[f.key]}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, [f.key]: e.target.value }))
              }
              placeholder={f.placeholder}
              className="h-7 text-xs w-full rounded-md border border-border/30 bg-transparent px-2 focus:outline-none focus:ring-1 focus:ring-ring/30"
            />
          </div>
        ))}
        <div className="space-y-0.5">
          <label className="text-[10px] text-muted-foreground/60">Tier</label>
          <select
            value={form.tier}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, tier: e.target.value }))
            }
            className="h-7 text-xs w-full rounded-md border border-border/30 bg-transparent px-2">
            <option value="high-end">High-end</option>
            <option value="low-end">Low-end</option>
          </select>
        </div>
        <div className="space-y-0.5">
          <label className="text-[10px] text-muted-foreground/60">Model</label>
          {localModels.length > 0 ? (
            <select
              value={form.model}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, model: e.target.value }))
              }
              className="h-7 text-xs w-full rounded-md border border-border/30 bg-transparent px-2">
              <option value="">Select...</option>
              {localModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={form.model}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, model: e.target.value }))
              }
              placeholder="model-name"
              className="h-7 text-xs w-full rounded-md border border-border/30 bg-transparent px-2 focus:outline-none focus:ring-1 focus:ring-ring/30"
            />
          )}
        </div>
      </div>

      {/* Temperature */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-muted-foreground/60">
            Temperature
          </label>
          <span className="text-[10px] font-mono text-muted-foreground">
            {form.temperature.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="2"
          step="0.05"
          value={form.temperature}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              temperature: parseFloat(e.target.value),
            }))
          }
          className="w-full h-1.5 rounded-full appearance-none bg-border/30 accent-blue-500"
        />
        <div className="flex justify-between text-[9px] text-muted-foreground/40">
          <span>Precise</span>
          <span>Creative</span>
        </div>
      </div>

      {/* Loaded models with eject */}
      {nodeId && online && localModels.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground/60">
            Loaded Models
          </label>
          {localModels.map((m) => (
            <div
              key={m}
              className="flex items-center justify-between py-1 px-2 rounded-md bg-muted/20 text-xs">
              <span className="font-mono text-[11px] truncate">{m}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {form.model !== m && (
                  <button
                    onClick={() => setForm((prev) => ({ ...prev, model: m }))}
                    className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
                    Set Active
                  </button>
                )}
                {form.model === m && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1"><Circle size={6} fill="currentColor" /> Active</span>
                )}
                <button
                  onClick={() => unloadModel(m)}
                  disabled={loadingModel === m}
                  className="text-[10px] text-red-400/60 hover:text-red-400 disabled:opacity-50 transition-colors">
                  {loadingModel === m ? '...' : '⏏ Eject'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load model by name */}
      {nodeId && online && (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/60">
            Load Model
          </label>
          <div className="flex gap-1.5">
            <input
              id={`load-model-${nodeId}`}
              placeholder="model-identifier"
              className="h-7 text-xs flex-1 rounded-md border border-border/30 bg-transparent px-2 focus:outline-none focus:ring-1 focus:ring-ring/30 font-mono"
            />
            <button
              onClick={() => {
                const el = document.getElementById(
                  `load-model-${nodeId}`,
                ) as HTMLInputElement;
                if (el?.value) {
                  loadModel(el.value);
                  el.value = '';
                }
              }}
              disabled={loadingModel !== null}
              className="h-7 px-2.5 rounded-md text-[11px] font-medium bg-foreground/10 hover:bg-foreground/15 disabled:opacity-50 transition-colors">
              {loadingModel ? '...' : 'Load'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
      const detail = (e as CustomEvent).detail as { page?: string; payload?: unknown } | undefined;
      if (!detail?.page) return;
      setPage(detail.page);
      if (detail.page === 'apps' && detail.payload) {
        // Re-dispatch so AppsPanel (already mounted) can pick it up
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('apps:prefill-prompt', { detail: detail.payload }));
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
    { id: 'dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
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
          <div className={page === 'apps' ? 'flex-1 overflow-hidden flex flex-col' : 'hidden'}>
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
                {logsOpen ? <><ChevronDown size={12} className="inline" /> Logs</> : <><ChevronRight size={12} className="inline" /> Logs</>}
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
    { t: string; cpu: number; mem: number; disk: number; mem_mb: number; mem_max: number }[]
  >([]);

  useEffect(() => {
    const load = () =>
      fetch(`${API_BASE}/api/system/history`)
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setHistory(d); })
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
          <span className="text-[11px] font-medium text-muted-foreground">CPU Usage</span>
          <span className="text-[11px] tabular-nums text-blue-400">
            {history[history.length - 1]?.cpu.toFixed(1)}%
          </span>
        </div>
        <ChartContainer config={cpuChartConfig} className="h-[120px] w-full">
          <AreaChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.15} />
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
            <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${Number(value).toFixed(1)}%`} />} />
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
          <span className="text-[11px] font-medium text-muted-foreground">Memory Usage</span>
          <span className="text-[11px] tabular-nums text-purple-400">
            {history[history.length - 1]?.mem.toFixed(1)}%
            <span className="text-muted-foreground/50 ml-1">
              ({history[history.length - 1]?.mem_mb}MB)
            </span>
          </span>
        </div>
        <ChartContainer config={memChartConfig} className="h-[120px] w-full">
          <AreaChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.15} />
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
            <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${Number(value).toFixed(1)}%`} />} />
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
const DEFAULT_APP_ICONS: Record<string, string> = {
  chat: '💬',
  todo: '✅',
  notes: '📝',
  calculator: '🧮',
  timer: '⏱️',
  weather: '🌤️',
  music: '🎵',
  photo: '📷',
  game: '🎮',
  news: '📰',
  calendar: '📅',
  map: '🗺️',
  mail: '📧',
  video: '🎬',
  book: '📚',
  shop: '🛒',
  finance: '💰',
  health: '❤️',
  food: '🍕',
  travel: '✈️',
};

function guessIcon(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(DEFAULT_APP_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return '📦';
}

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
