import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatUptime } from '@/lib/format';
import type { SystemInfo } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { StatusDot } from '@/components/ui/status-dot';
import { dashboardApi, type ClusterAggregate } from '@/features/dashboard/api';

interface StatusBarProps {
  sys: SystemInfo | null;
  nodeCount: number;
  appCount: number;
  logsOpen: boolean;
  onToggleLogs: () => void;
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  const safe = Math.max(0, Math.min(100, pct));
  return (
    <span className="w-12 h-1.5 rounded-full bg-muted inline-block overflow-hidden align-middle">
      <span
        className={`block h-full rounded-full ${color} transition-all`}
        style={{ width: `${safe}%` }}
      />
    </span>
  );
}

function ClusterChips({ c }: { c: ClusterAggregate }) {
  if (c.nodes_online === 0) return null;
  const memPct =
    c.mem_total_gb > 0 ? (c.mem_used_gb / c.mem_total_gb) * 100 : 0;
  const vramPct =
    c.vram_total_mb > 0 ? (c.vram_used_mb / c.vram_total_mb) * 100 : 0;
  return (
    <>
      <span className="text-border/60 hidden md:inline">│</span>
      <span className="hidden md:flex items-center gap-1.5" title="Cluster avg CPU">
        N·CPU
        <MiniBar pct={c.cpu_avg} color="bg-blue-400" />
        <span className="tabular-nums w-7 text-right">
          {c.cpu_avg.toFixed(0)}%
        </span>
      </span>
      <span className="text-border/60 hidden md:inline">│</span>
      <span className="hidden md:flex items-center gap-1.5" title="Cluster RAM">
        N·RAM
        <MiniBar pct={memPct} color="bg-purple-400" />
        <span className="tabular-nums">
          {c.mem_used_gb.toFixed(1)}/{c.mem_total_gb.toFixed(0)}G
        </span>
      </span>
      {c.gpu_count > 0 && (
        <>
          <span className="text-border/60 hidden lg:inline">│</span>
          <span className="hidden lg:flex items-center gap-1.5" title="Cluster GPU avg">
            GPU
            <MiniBar pct={c.gpu_avg} color="bg-emerald-400" />
            <span className="tabular-nums w-7 text-right">
              {c.gpu_avg.toFixed(0)}%
            </span>
          </span>
          <span className="text-border/60 hidden lg:inline">│</span>
          <span className="hidden lg:flex items-center gap-1.5" title="VRAM">
            VRAM
            <MiniBar pct={vramPct} color="bg-cyan-400" />
            <span className="tabular-nums">
              {(c.vram_used_mb / 1024).toFixed(1)}/
              {(c.vram_total_mb / 1024).toFixed(0)}G
            </span>
          </span>
          {c.gpu_temp_avg > 0 && (
            <>
              <span className="text-border/60 hidden xl:inline">│</span>
              <span className="tabular-nums hidden xl:inline" title="GPU temp avg">
                {c.gpu_temp_avg.toFixed(0)}°C
              </span>
            </>
          )}
        </>
      )}
      {c.cpu_temp_avg > 0 && c.gpu_count === 0 && (
        <>
          <span className="text-border/60 hidden xl:inline">│</span>
          <span className="tabular-nums hidden xl:inline" title="CPU temp avg">
            {c.cpu_temp_avg.toFixed(0)}°C
          </span>
        </>
      )}
    </>
  );
}

export function StatusBar({
  sys,
  nodeCount,
  appCount,
  logsOpen,
  onToggleLogs,
}: StatusBarProps) {
  const [cluster, setCluster] = useState<ClusterAggregate | null>(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const c = await dashboardApi.cluster();
      if (alive && c) setCluster(c);
    };
    run();
    const id = setInterval(run, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <footer className="h-7 shrink-0 bg-muted/15 border-t border-border/30 flex items-center px-4 gap-3 text-xs font-mono text-muted-foreground overflow-x-auto">
      {sys ? (
        <>
          <span className="flex items-center gap-1.5">
            <StatusDot status="running" />
            {sys.hostname}
          </span>
          <span className="text-border/60 hidden sm:inline">│</span>
          <span className="hidden sm:inline">Up {formatUptime(sys.uptime_seconds)}</span>
          <span className="text-border/60">│</span>
          <span className="flex items-center gap-1.5">
            CPU
            <MiniBar pct={sys.cpu.used_pct} color="bg-blue-500" />
            <span className="tabular-nums w-7 text-right">
              {sys.cpu.used_pct.toFixed(0)}%
            </span>
          </span>
          <span className="text-border/60">│</span>
          <span className="flex items-center gap-1.5">
            Mem
            <MiniBar pct={sys.memory.used_pct} color="bg-purple-500" />
            <span className="tabular-nums w-7 text-right">
              {sys.memory.used_pct.toFixed(0)}%
            </span>
          </span>
          <span className="text-border/60 hidden sm:inline">│</span>
          <span className="hidden sm:flex items-center gap-1.5">
            Disk
            <MiniBar pct={sys.disk.used_pct} color="bg-amber-500" />
            <span className="tabular-nums w-7 text-right">
              {sys.disk.used_pct.toFixed(0)}%
            </span>
          </span>
          {cluster && <ClusterChips c={cluster} />}
          <span className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
            <span className="hidden sm:inline">
              {nodeCount} node{nodeCount !== 1 ? 's' : ''}
            </span>
            <span className="hidden sm:inline">
              {appCount} app{appCount !== 1 ? 's' : ''}
            </span>
            <button
              onClick={onToggleLogs}
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
          <Spinner size={10} />
          Connecting...
        </span>
      )}
    </footer>
  );
}
