import { useEffect, useState, type ReactNode } from 'react';
import {
  CircuitBoard,
  Clock,
  Cpu,
  Gpu,
  HardDrive,
  MemoryStick,
  Network,
  ScrollText,
  Server,
  Thermometer,
} from 'lucide-react';
import { formatUptime } from '@/lib/format';
import type { SystemInfo } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { StatusDot } from '@/components/ui/status-dot';
import { IconButton } from '@/components/ui/icon-button';
import { dashboardApi, type ClusterAggregate } from '@/features/dashboard';

interface StatusBarProps {
  sys: SystemInfo | null;
  nodeCount: number;
  logsOpen: boolean;
  onToggleLogs: () => void;
}

const ICON = 13;

/** One icon-labelled reading. `className` carries responsive visibility. */
function Metric({
  icon,
  title,
  pct,
  children,
  className = 'flex',
}: {
  icon: ReactNode;
  title: string;
  pct?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`${className} items-center gap-1.5`} title={title}>
      <span className="text-muted-foreground/70">{icon}</span>
      {pct !== undefined && <MiniBar pct={pct} />}
      <span className="tabular-nums">{children}</span>
    </span>
  );
}

function MiniBar({ pct }: { pct: number }) {
  const safe = Math.max(0, Math.min(100, pct));
  return (
    <span className="w-10 h-1 rounded-full bg-muted inline-block overflow-hidden">
      <span
        className="block h-full rounded-full bg-foreground/60 transition-all"
        style={{ width: `${safe}%` }}
      />
    </span>
  );
}

function ClusterMetrics({ c }: { c: ClusterAggregate }) {
  if (c.nodes_online === 0) return null;
  const memPct =
    c.mem_total_gb > 0 ? (c.mem_used_gb / c.mem_total_gb) * 100 : 0;
  const vramPct =
    c.vram_total_mb > 0 ? (c.vram_used_mb / c.vram_total_mb) * 100 : 0;
  const temp = c.gpu_count > 0 ? c.gpu_temp_avg : c.cpu_temp_avg;
  return (
    <span className="hidden md:flex items-center gap-4 pl-4">
      <span className="text-muted-foreground/70" title="Cluster">
        <Network size={ICON} />
      </span>
      <Metric icon={<Cpu size={ICON} />} title="Cluster CPU" pct={c.cpu_avg}>
        {c.cpu_avg.toFixed(0)}%
      </Metric>
      <Metric
        icon={<MemoryStick size={ICON} />}
        title="Cluster RAM"
        pct={memPct}>
        {c.mem_used_gb.toFixed(1)}/{c.mem_total_gb.toFixed(0)}G
      </Metric>
      {c.gpu_count > 0 && (
        <>
          <Metric
            icon={<Gpu size={ICON} />}
            title="Cluster GPU"
            pct={c.gpu_avg}
            className="hidden lg:flex">
            {c.gpu_avg.toFixed(0)}%
          </Metric>
          <Metric
            icon={<CircuitBoard size={ICON} />}
            title="VRAM"
            pct={vramPct}
            className="hidden lg:flex">
            {(c.vram_used_mb / 1024).toFixed(1)}/
            {(c.vram_total_mb / 1024).toFixed(0)}G
          </Metric>
        </>
      )}
      {temp > 0 && (
        <Metric
          icon={<Thermometer size={ICON} />}
          title={c.gpu_count > 0 ? 'GPU temp' : 'CPU temp'}
          className="hidden xl:flex">
          {temp.toFixed(0)}°
        </Metric>
      )}
    </span>
  );
}

export function StatusBar({
  sys,
  nodeCount,
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
    <footer className="h-9 shrink-0 bg-background flex items-center pl-5 pr-3 gap-4 text-xs text-muted-foreground overflow-x-auto">
      {sys ? (
        <>
          <span className="flex items-center gap-2 text-foreground/80">
            <StatusDot status="running" />
            {sys.hostname}
          </span>
          <Metric icon={<Clock size={ICON} />} title="Uptime">
            {formatUptime(sys.uptime_seconds)}
          </Metric>
          <Metric icon={<Cpu size={ICON} />} title="CPU" pct={sys.cpu.used_pct}>
            {sys.cpu.used_pct.toFixed(0)}%
          </Metric>
          <Metric
            icon={<MemoryStick size={ICON} />}
            title="Memory"
            pct={sys.memory.used_pct}>
            {sys.memory.used_pct.toFixed(0)}%
          </Metric>
          <Metric
            icon={<HardDrive size={ICON} />}
            title="Disk"
            pct={sys.disk.used_pct}>
            {sys.disk.used_pct.toFixed(0)}%
          </Metric>
          {cluster && <ClusterMetrics c={cluster} />}
          <span className="ml-auto flex items-center gap-4 shrink-0">
            <Metric icon={<Server size={ICON} />} title="Nodes">
              {nodeCount}
            </Metric>
            <IconButton
              icon={<ScrollText size={14} />}
              label={logsOpen ? 'Hide logs' : 'Show logs'}
              active={logsOpen}
              onClick={onToggleLogs}
            />
          </span>
        </>
      ) : (
        <span className="flex items-center gap-1.5">
          <Spinner size={10} />
          Connecting…
        </span>
      )}
    </footer>
  );
}
