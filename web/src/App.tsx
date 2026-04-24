import './index.css';
import { useState, useEffect } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { LayoutDashboard, MessageSquare, Blocks, Settings, Hexagon, ChevronDown, ChevronRight } from 'lucide-react';
import { API_BASE } from '@/lib/api';
import { formatUptime } from '@/lib/format';
import { DashboardPanel } from '@/panels/DashboardPanel';
import { NodesPanel } from '@/panels/NodesPanel';
import { LogsPanel } from '@/panels/LogsPanel';
import { AppsPanel } from '@/panels/AppsPanel';
import { ChatPanel } from '@/panels/ChatPanel';
import { SettingsPanel } from '@/panels/SettingsPanel';
import { guessIcon } from '@/lib/icons';
import type { SystemInfo, AppInfo } from '@/lib/types';

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
