import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart } from 'recharts';
import {
  Cpu,
  MemoryStick,
  Power,
  PowerOff,
  RefreshCw,
  Thermometer,
  Zap,
} from 'lucide-react';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';
import type { NodeStats } from '@/lib/types';
import { StatusDot } from '@/components/ui/status-dot';
import { formatUptime, relTime } from '@/lib/format';
import { settingsApi } from '@/features/settings/api';

const HISTORY_LEN = 30;

interface NodeHistory {
  cpu: { i: number; v: number }[];
  mem: { i: number; v: number }[];
  gpu: { i: number; v: number }[];
}

/** Per-node sparkline cards: rolling client-side history for CPU/Mem/GPU,
 * built from the same `/api/nodes/stats` polling endpoint. */
export function NodeMicroCards() {
  const {
    nodeStats: stats,
    nodes: nodeRows,
    lastTick,
    ready,
  } = useDashboardData();
  const nodes = useMemo(
    () => nodeRows.map((x) => ({ id: x.id, name: x.name })),
    [nodeRows],
  );
  const histRef = useRef<Record<string, NodeHistory>>({});
  const counterRef = useRef(0);
  const [, force] = useState(0);
  const [busy, setBusy] = useState<Record<string, 'wake' | 'shutdown' | null>>(
    {},
  );

  // Update rolling history each shared-tick.
  useEffect(() => {
    if (!lastTick) return;
    const i = counterRef.current++;
    Object.entries(stats).forEach(([id, st]: [string, NodeStats]) => {
      const h = histRef.current[id] || { cpu: [], mem: [], gpu: [] };
      h.cpu = [...h.cpu, { i, v: st.cpu_usage || 0 }].slice(-HISTORY_LEN);
      h.mem = [...h.mem, { i, v: st.mem_pct || 0 }].slice(-HISTORY_LEN);
      h.gpu = [...h.gpu, { i, v: st.gpu_usage || 0 }].slice(-HISTORY_LEN);
      histRef.current[id] = h;
    });
    force((x) => x + 1);
  }, [lastTick, stats]);

  const allIds = useMemo(
    () =>
      Array.from(new Set([...nodes.map((n) => n.id), ...Object.keys(stats)])),
    [nodes, stats],
  );

  if (allIds.length === 0) {
    if (!ready) {
      // Skeleton while first poll is in flight — avoids the empty-flash.
      return (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-border/40 bg-card/40 px-4 py-3 h-16 animate-pulse"
            />
          ))}
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-dashed border-border/40 bg-card/20 px-4 py-6 text-center text-sm text-muted-foreground/80">
        No cluster nodes configured.
      </div>
    );
  }

  const handleWake = async (id: string) => {
    setBusy((b) => ({ ...b, [id]: 'wake' }));
    try {
      await settingsApi.wakeNode(id);
    } catch (e) {
      console.error('wake failed', e);
    } finally {
      setBusy((b) => ({ ...b, [id]: null }));
    }
  };
  const handleShutdown = async (id: string, name: string) => {
    if (!window.confirm(`Shutdown ${name}? It will need a wake to come back.`))
      return;
    setBusy((b) => ({ ...b, [id]: 'shutdown' }));
    try {
      await settingsApi.shutdownNode(id);
    } catch (e) {
      console.error('shutdown failed', e);
      window.alert('Shutdown failed: ' + (e as Error).message);
    } finally {
      setBusy((b) => ({ ...b, [id]: null }));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {allIds.map((id) => {
        const s = stats[id];
        const meta = nodes.find((n) => n.id === id);
        const name = s?.hostname || meta?.name || id;
        const isOnline =
          s && Date.now() - new Date(s.last_seen).getTime() < 30000;
        const h = histRef.current[id];
        const busyState = busy[id];
        // Only configured nodes (in nodeRows) can be powered on/off.
        const isConfigured = nodes.some((n) => n.id === id);

        // ── Offline: a dedicated, calmer card. Wake button is the focal
        //    point; cached hardware shows faded so identity is preserved.
        if (!isOnline) {
          const lastSeenLabel = s
            ? `Last seen ${relTime(new Date(s.last_seen).getTime())}`
            : 'Never reported';
          return (
            <div
              key={id}
              className="rounded-xl border border-dashed border-border/40 bg-card/20 px-4 py-3 flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30 shrink-0" />
              <span className="text-base font-medium text-foreground/75 truncate min-w-0">
                {name}
              </span>
              <span className="text-xs uppercase tracking-wider text-muted-foreground/65 px-1.5 py-0.5 rounded border border-border/20 shrink-0">
                Offline
              </span>
              {s && (
                <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground/65 min-w-0 truncate">
                  <span className="text-muted-foreground/25">·</span>
                  <span>{s.cpu_cores} cores</span>
                  <span className="text-muted-foreground/25">·</span>
                  <span>{s.mem_total_gb.toFixed(0)} GB</span>
                  {s.gpu_name && (
                    <>
                      <span className="text-muted-foreground/25">·</span>
                      <span className="truncate max-w-[160px]">
                        {s.gpu_name}
                      </span>
                    </>
                  )}
                </div>
              )}
              <div className="flex-1" />
              <span className="text-xs text-muted-foreground/65 shrink-0 hidden sm:inline">
                {lastSeenLabel}
              </span>
              {isConfigured && (
                <button
                  onClick={() => handleWake(id)}
                  disabled={busyState === 'wake'}
                  title={`Wake ${name} (Wake-on-LAN)`}
                  aria-label={`Wake ${name}`}
                  className={`p-1 rounded border transition-colors shrink-0 ${
                    busyState === 'wake'
                      ? 'border-border/15 text-muted-foreground/65 cursor-wait'
                      : 'border-emerald-500/25 text-emerald-400/85 hover:bg-emerald-500/10 hover:border-emerald-500/45'
                  }`}>
                  {busyState === 'wake' ? (
                    <RefreshCw size={11} className="animate-spin" />
                  ) : (
                    <Power size={11} />
                  )}
                </button>
              )}
            </div>
          );
        }

        return (
          <div
            key={id}
            className="rounded-xl border border-border/40 hover:border-border/60 bg-card/40 px-4 py-3 transition-colors">
            {/* Header row: identity (left) + temp/power (right). */}
            <div className="flex items-center gap-3 min-w-0">
              <StatusDot status="running" size={10} />
              <span className="text-base font-semibold truncate min-w-0">
                {name}
              </span>
              {s && (
                <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground/65 min-w-0 truncate">
                  <span className="text-muted-foreground/30">·</span>
                  <span>{s.cpu_cores} cores</span>
                  <span className="text-muted-foreground/30">·</span>
                  <span>{s.mem_total_gb.toFixed(0)} GB</span>
                  {s.gpu_name && (
                    <>
                      <span className="text-muted-foreground/30">·</span>
                      <span className="text-emerald-400/80 truncate max-w-[160px]">
                        {s.gpu_name}
                      </span>
                    </>
                  )}
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-muted-foreground/60">
                    up {formatUptime(s.uptime_secs)}
                  </span>
                </div>
              )}
              <div className="flex-1" />
              {s?.cpu_temp != null && (
                <span className="flex items-center gap-1.5 text-xs text-amber-400/80 shrink-0">
                  <Thermometer size={13} />
                  {s.cpu_temp}°
                </span>
              )}
              {isConfigured && (
                <PowerBtn
                  title={`Shut down ${name}`}
                  onClick={() => handleShutdown(id, name)}
                  busy={busyState === 'shutdown'}
                  variant="off"
                />
              )}
            </div>

            {/* Metrics row: roomy CPU / Mem / GPU sparklines + VRAM bar. */}
            {s && (
              <div className="mt-3 flex items-center flex-wrap gap-x-5 gap-y-2">
                <InlineMetric
                  icon={<Cpu size={13} />}
                  label="CPU"
                  value={s.cpu_usage}
                  color="#60a5fa"
                  data={h?.cpu || []}
                />
                <InlineMetric
                  icon={<MemoryStick size={13} />}
                  label="Mem"
                  value={s.mem_pct}
                  color="#a78bfa"
                  data={h?.mem || []}
                />
                <InlineMetric
                  icon={<Zap size={13} />}
                  label="GPU"
                  value={s.gpu_usage ?? null}
                  color="#34d399"
                  data={h?.gpu || []}
                />
                {s.gpu_mem_total_mb != null && s.gpu_mem_total_mb > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/70">
                      VRAM
                    </span>
                    <div className="w-28 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-400/80 transition-all duration-700"
                        style={{
                          width: `${((s.gpu_mem_used_mb || 0) / s.gpu_mem_total_mb) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-emerald-400/85">
                      {Math.round((s.gpu_mem_used_mb || 0) / 1024)}/
                      {Math.round(s.gpu_mem_total_mb / 1024)}G
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Bottom row: model picker (compact). Hidden when no models reported. */}
            {s && (
              <div className="mt-3 pt-2.5 border-t border-border/15">
                <ModelPicker nodeId={id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PowerBtn({
  title,
  onClick,
  busy,
  variant,
}: {
  title: string;
  onClick: () => void;
  busy?: boolean;
  variant: 'on' | 'off';
}) {
  const Icon = variant === 'on' ? Power : PowerOff;
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={title}
      aria-label={title}
      className={`p-1 rounded border transition-colors ${
        busy
          ? 'border-border/15 text-muted-foreground/65 cursor-wait'
          : variant === 'on'
            ? 'border-emerald-500/25 text-emerald-400/85 hover:bg-emerald-500/10 hover:border-emerald-500/45'
            : 'border-rose-500/20 text-rose-400/80 hover:bg-rose-500/10 hover:border-rose-500/40'
      }`}>
      <Icon size={11} />
    </button>
  );
}

// Compact icon + sparkline + percentage, sized for inline use in the
// horizontal node row. Width is fixed so multiple metrics line up cleanly
// across rows.
function InlineMetric({
  icon,
  label,
  value,
  color,
  data,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  color: string;
  data: { i: number; v: number }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5" style={{ color }}>
        {icon}
        <span className="text-xs uppercase tracking-wider text-muted-foreground/70">
          {label}
        </span>
      </span>
      {data.length >= 2 ? (
        <div className="h-6 w-20">
          <AreaChart
            data={data}
            width={80}
            height={24}
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient
                id={`im-${color.slice(1)}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.5} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.25}
              fill={`url(#im-${color.slice(1)})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </div>
      ) : (
        <div className="h-6 w-20 rounded bg-white/[0.04]" />
      )}
      <span
        className="text-xs tabular-nums font-medium w-9 text-right"
        style={{ color }}>
        {value == null ? '—' : `${Math.round(value)}%`}
      </span>
    </div>
  );
}

interface ModelStatus {
  id: string;
  state: string;
  type?: string;
  loaded: boolean;
}

function ModelPicker({ nodeId }: { nodeId: string }) {
  const [models, setModels] = useState<ModelStatus[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [busy, setBusy] = useState<'load' | 'unload' | 'refresh' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = async () => {
    setBusy('refresh');
    setError(null);
    try {
      const res = await settingsApi.getNodeModelsStatus(nodeId);
      const list = res?.models ?? [];
      setModels(list);
      // Prefer currently-loaded model in the dropdown; else first item.
      const loaded = list.find((m) => m.loaded);
      setSelected((prev) => prev || loaded?.id || list[0]?.id || '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  const loaded = models?.find((m) => m.loaded);

  const onLoad = async () => {
    if (!selected) return;
    setBusy('load');
    setError(null);
    try {
      await settingsApi.loadNodeModel(nodeId, selected);
      await fetchModels();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const onUnload = async () => {
    if (!loaded) return;
    setBusy('unload');
    setError(null);
    try {
      await settingsApi.unloadNodeModel(nodeId, loaded.id);
      await fetchModels();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  if (models === null && busy === 'refresh') {
    return (
      <div className="text-xs text-muted-foreground/65 italic">
        loading models…
      </div>
    );
  }
  if (error && (!models || models.length === 0)) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-rose-400/70">
        <span className="truncate">model api unavailable</span>
        <button
          onClick={fetchModels}
          title="Retry"
          className="p-0.5 rounded hover:bg-white/5">
          <RefreshCw size={9} />
        </button>
      </div>
    );
  }
  if (!models || models.length === 0) {
    return (
      <div className="text-xs text-muted-foreground/65 italic">
        no models on host
      </div>
    );
  }

  const selectedIsLoaded = !!models.find((m) => m.id === selected && m.loaded);
  const dotClass = loaded ? 'bg-emerald-400' : 'bg-muted-foreground/30';

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground/70">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotClass}`} />
        <span>Model</span>
        <span className="ml-auto text-emerald-400/70 normal-case tracking-normal truncate max-w-[140px]">
          {loaded ? loaded.id : 'none loaded'}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={busy !== null}
          className="flex-1 min-w-0 text-xs bg-muted/20 border border-border/20 rounded px-1.5 py-1 text-foreground/85 focus:outline-none focus:border-border/50 disabled:opacity-50">
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
              {m.loaded ? ' • loaded' : ''}
            </option>
          ))}
        </select>
        <button
          onClick={onLoad}
          disabled={busy !== null || !selected || selectedIsLoaded}
          title={selectedIsLoaded ? 'Already loaded' : 'Load this model'}
          className="px-2 py-1 text-xs rounded border border-emerald-500/25 text-emerald-400/85 hover:bg-emerald-500/10 hover:border-emerald-500/45 disabled:opacity-40 disabled:hover:bg-transparent transition-colors">
          {busy === 'load' ? '…' : 'Load'}
        </button>
        {loaded && (
          <button
            onClick={onUnload}
            disabled={busy !== null}
            title={`Unload ${loaded.id}`}
            className="px-2 py-1 text-xs rounded border border-rose-500/20 text-rose-400/80 hover:bg-rose-500/10 hover:border-rose-500/40 disabled:opacity-40 transition-colors">
            {busy === 'unload' ? '…' : 'Eject'}
          </button>
        )}
        <button
          onClick={fetchModels}
          disabled={busy !== null}
          title="Refresh"
          className="p-1 rounded border border-border/20 text-muted-foreground/60 hover:text-foreground hover:bg-white/5 disabled:opacity-40 transition-colors">
          <RefreshCw
            size={10}
            className={busy === 'refresh' ? 'animate-spin' : ''}
          />
        </button>
      </div>
      {error && (
        <div className="text-xs text-rose-400/70 truncate">{error}</div>
      )}
    </div>
  );
}
