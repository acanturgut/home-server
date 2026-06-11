import { useEffect, useState } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Zap,
} from 'lucide-react';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';

interface KPI {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  warn?: boolean;
}

/** Top-of-dashboard KPI summary strip. Aggregates across the whole cluster.
 * Intentionally muted: a single neutral foreground colour, no sparklines, only
 * red used to flag failures. The fuller per-area views live below. */
export function KPIStrip() {
  const { logs, nodeStats, apps } = useDashboardData();
  const [appsCount, setAppsCount] = useState({
    total: 0,
    running: 0,
    failed: 0,
  });
  const [avgLatencyMs, setAvgLatencyMs] = useState<number | null>(null);
  const [reqRate, setReqRate] = useState(0);
  const [tokensPerMin, setTokensPerMin] = useState(0);
  const [avgCpuPct, setAvgCpuPct] = useState(0);
  const [avgMemPct, setAvgMemPct] = useState(0);

  // Recompute aggregates whenever shared data ticks.
  useEffect(() => {
    setAppsCount({
      total: apps.length,
      running: apps.filter((a) => a.status === 'running').length,
      failed: apps.filter((a) => a.status === 'failed').length,
    });
    const liveStats = Object.values(nodeStats).filter(
      (n) => Date.now() - new Date(n.last_seen).getTime() < 30_000,
    );
    setAvgCpuPct(
      liveStats.length
        ? liveStats.reduce((a, n) => a + (n.cpu_usage || 0), 0) /
            liveStats.length
        : 0,
    );
    setAvgMemPct(
      liveStats.length
        ? liveStats.reduce((a, n) => a + (n.mem_pct || 0), 0) / liveStats.length
        : 0,
    );
    const latMs = logs
      .map((l) => l.latency || '')
      .map((str) => {
        if (!str) return null;
        if (str.endsWith('ms')) return parseFloat(str);
        if (str.endsWith('µs') || str.endsWith('us'))
          return parseFloat(str) / 1000;
        if (str.endsWith('s')) return parseFloat(str) * 1000;
        return null;
      })
      .filter((n): n is number => n != null && !Number.isNaN(n));
    setAvgLatencyMs(
      latMs.length ? latMs.reduce((a, b) => a + b, 0) / latMs.length : null,
    );
    setReqRate(
      logs.filter((l) => Date.now() - new Date(l.timestamp).getTime() < 60_000)
        .length,
    );
    let tpm = 0;
    logs.forEach((l) => {
      if (
        l.timestamp &&
        Date.now() - new Date(l.timestamp).getTime() < 60_000
      ) {
        tpm +=
          l.total_tokens || (l.prompt_tokens || 0) + (l.completion_tokens || 0);
      }
    });
    setTokensPerMin(tpm);
  }, [logs, nodeStats, apps]);

  const liveCount = Object.values(nodeStats).filter(
    (n) => Date.now() - new Date(n.last_seen).getTime() < 30_000,
  ).length;
  const totalCores = Object.values(nodeStats).reduce(
    (a, n) => a + (n.cpu_cores || 0),
    0,
  );
  const totalMemGb = Object.values(nodeStats).reduce(
    (a, n) => a + (n.mem_total_gb || 0),
    0,
  );
  const totalVramMb = Object.values(nodeStats).reduce(
    (a, n) => a + (n.gpu_mem_total_mb || 0),
    0,
  );

  const kpis: KPI[] = [
    {
      label: 'Cluster',
      value: `${liveCount}/${Object.keys(nodeStats).length || liveCount} nodes`,
      detail: `${totalCores} cores · ${totalMemGb.toFixed(0)} GB · ${(totalVramMb / 1024).toFixed(1)} GB VRAM`,
      icon: <Cpu size={13} />,
    },
    {
      label: 'Load',
      value: `${avgCpuPct.toFixed(0)}% / ${avgMemPct.toFixed(0)}%`,
      detail: 'avg cpu · mem',
      icon: <MemoryStick size={13} />,
      warn: avgCpuPct > 85 || avgMemPct > 85,
    },
    {
      label: 'GPU',
      value: `${(totalVramMb / 1024).toFixed(1)} GB`,
      detail: `${Object.values(nodeStats).filter((n) => n.gpu_name).length} gpu${Object.values(nodeStats).filter((n) => n.gpu_name).length === 1 ? '' : 's'}`,
      icon: <Zap size={13} />,
    },
    {
      label: 'Apps',
      value: `${appsCount.running}/${appsCount.total}`,
      detail:
        appsCount.failed > 0 ? `${appsCount.failed} failed` : 'all healthy',
      icon: <HardDrive size={13} />,
      warn: appsCount.failed > 0,
    },
    {
      label: 'Latency',
      value:
        avgLatencyMs == null
          ? '—'
          : avgLatencyMs > 1000
            ? `${(avgLatencyMs / 1000).toFixed(1)}s`
            : `${avgLatencyMs.toFixed(0)}ms`,
      detail: 'last 200 req',
      icon: <Activity size={13} />,
    },
    {
      label: 'Throughput',
      value: `${reqRate}/m`,
      detail: `${fmtBig(tokensPerMin)} tok/m`,
      icon: <Network size={13} />,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {kpis.map((k) => (
        <div
          key={k.label}
          className="rounded-xl border border-border/40 bg-card/40 px-3 py-2 hover:border-border/40 transition-colors">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground/70">
            <span className="text-muted-foreground/70">{k.icon}</span>
            <span className="truncate">{k.label}</span>
          </div>
          <div
            className={`mt-1 text-base font-semibold tabular-nums leading-tight ${
              k.warn ? 'text-amber-300/95' : 'text-foreground/90'
            }`}>
            {k.value}
          </div>
          <div className="text-xs text-muted-foreground/70 truncate mt-0.5">
            {k.detail}
          </div>
        </div>
      ))}
    </div>
  );
}

function fmtBig(n: number) {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}
