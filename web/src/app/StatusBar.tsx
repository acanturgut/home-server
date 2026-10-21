import { useState, type ReactNode } from 'react';
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
import { appApi, type ClusterAggregate, type SystemInfo } from '@/app/api';
import { IconButton } from '@/components/ui/icon-button';
import { Meter } from '@/components/ui/meter';
import { Spinner } from '@/components/ui/spinner';
import { StatusDot } from '@/components/ui/status-dot';
import { usePolling } from '@/hooks/usePolling';
import { formatUptime } from '@/lib/format';
import { cn } from '@/lib/utils';

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
    <div
      className={cn(
        className,
        'shrink-0 items-center gap-1.5 whitespace-nowrap',
      )}
      title={title}
    >
      <span className="text-muted-foreground">{icon}</span>
      {pct !== undefined && (
        <Meter value={pct} label={title} className="w-10" />
      )}
      <span className="tabular-nums">{children}</span>
    </div>
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
    <div className="hidden items-center gap-4 pl-4 md:flex">
      <span className="text-muted-foreground" title="Cluster">
        <Network size={ICON} />
      </span>
      <Metric icon={<Cpu size={ICON} />} title="Cluster CPU" pct={c.cpu_avg}>
        {c.cpu_avg.toFixed(0)}%
      </Metric>
      <Metric
        icon={<MemoryStick size={ICON} />}
        title="Cluster RAM"
        pct={memPct}
      >
        {c.mem_used_gb.toFixed(1)}/{c.mem_total_gb.toFixed(0)}G
      </Metric>
      {c.gpu_count > 0 && (
        <>
          <Metric
            icon={<Gpu size={ICON} />}
            title="Cluster GPU"
            pct={c.gpu_avg}
            className="hidden lg:flex"
          >
            {c.gpu_avg.toFixed(0)}%
          </Metric>
          <Metric
            icon={<CircuitBoard size={ICON} />}
            title="VRAM"
            pct={vramPct}
            className="hidden lg:flex"
          >
            {(c.vram_used_mb / 1024).toFixed(1)}/
            {(c.vram_total_mb / 1024).toFixed(0)}G
          </Metric>
        </>
      )}
      {temp > 0 && (
        <Metric
          icon={<Thermometer size={ICON} />}
          title={c.gpu_count > 0 ? 'GPU temp' : 'CPU temp'}
          className="hidden xl:flex"
        >
          {temp.toFixed(0)}°
        </Metric>
      )}
    </div>
  );
}

/** Bottom bar: host and cluster load (polled), node count, logs toggle. */
export function StatusBar({
  logsOpen,
  onToggleLogs,
}: {
  logsOpen: boolean;
  onToggleLogs: () => void;
}) {
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [cluster, setCluster] = useState<ClusterAggregate | null>(null);

  usePolling(async () => {
    const s = await appApi.system();
    if (s) setSys(s);
  }, 8000);
  usePolling(async () => {
    const c = await appApi.cluster();
    if (c) setCluster(c);
  }, 5000);

  return (
    <footer className="flex h-9 shrink-0 items-center gap-4 overflow-x-auto border-t pr-3 pl-5 text-xs text-muted-foreground">
      {sys ? (
        <>
          <span className="flex items-center gap-2 text-foreground">
            <StatusDot status="online" />
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
            pct={sys.memory.used_pct}
          >
            {sys.memory.used_pct.toFixed(0)}%
          </Metric>
          <Metric
            icon={<HardDrive size={ICON} />}
            title="Disk"
            pct={sys.disk.used_pct}
          >
            {sys.disk.used_pct.toFixed(0)}%
          </Metric>
          {cluster && <ClusterMetrics c={cluster} />}
          <div className="ml-auto flex shrink-0 items-center gap-4">
            {cluster && (
              <Metric icon={<Server size={ICON} />} title="Nodes online">
                {cluster.nodes_online}/{cluster.nodes_total}
              </Metric>
            )}
            <IconButton
              icon={<ScrollText />}
              label={logsOpen ? 'Hide logs' : 'Show logs'}
              active={logsOpen}
              onClick={onToggleLogs}
            />
          </div>
        </>
      ) : (
        <span className="flex items-center gap-1.5">
          <Spinner size={12} />
          Connecting…
        </span>
      )}
    </footer>
  );
}
