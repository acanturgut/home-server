import {
  Cpu,
  MemoryStick,
  Power,
  PowerOff,
  Thermometer,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Sparkline } from '@/components/ui/chart';
import { IconButton } from '@/components/ui/icon-button';
import { Meter } from '@/components/ui/meter';
import { Spinner } from '@/components/ui/spinner';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusDot } from '@/components/ui/status-dot';
import { ModelPicker } from '@/features/dashboard/components/ModelPicker';
import type { NodeHistory } from '@/features/dashboard/hooks/useNodeHistory';
import { formatUptime, relTime } from '@/lib/format';
import type { NodeStats } from '@/lib/nodes';

/** "8 cores · 32 GB · RTX 4090". */
const specs = (s: NodeStats) =>
  [`${s.cpu_cores} cores`, `${s.mem_total_gb.toFixed(0)} GB`, s.gpu_name]
    .filter(Boolean)
    .join(' · ');

const pct = (v: number | undefined) => (v == null ? '—' : `${Math.round(v)}%`);

/** Percentage sparkline; an empty slot until there are two samples. */
const spark = (data: number[] | undefined, color: string) =>
  data && data.length > 1 ? (
    <Sparkline data={data} color={color} max={100} className="h-6" />
  ) : (
    <div className="h-6" />
  );

/** Power control: Power-off for online nodes, Wake-on-LAN for offline ones. */
function PowerButton({
  name,
  online,
  busy,
  onClick,
}: {
  name: string;
  online: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <IconButton
      icon={busy ? <Spinner /> : online ? <PowerOff /> : <Power />}
      label={online ? `Shut down ${name}` : `Wake ${name}`}
      disabled={busy}
      onClick={onClick}
    />
  );
}

/** A reporting node: hardware, live CPU / memory / GPU / VRAM and its model. */
export function OnlineNodeCard({
  id,
  name,
  stats: s,
  history,
  power,
}: {
  id: string;
  name: string;
  stats: NodeStats;
  history?: NodeHistory;
  /** Present for configured nodes, which can be shut down. */
  power?: { busy: boolean; onClick: () => void };
}) {
  const vramTotal = s.gpu_mem_total_mb ?? 0;
  const vramUsed = s.gpu_mem_used_mb ?? 0;
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-3">
        <StatusDot status="online" className="size-2" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {specs(s)} · up {formatUptime(s.uptime_secs)}
          </p>
        </div>
        {s.cpu_temp != null && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <Thermometer className="size-3.5" aria-hidden />
            {s.cpu_temp}°
          </span>
        )}
        {power && <PowerButton name={name} online {...power} />}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile
          label="CPU"
          icon={<Cpu />}
          value={pct(s.cpu_usage)}
          chart={spark(history?.cpu, 'var(--chart-1)')}
        />
        <StatTile
          label="Memory"
          icon={<MemoryStick />}
          value={pct(s.mem_pct)}
          chart={spark(history?.mem, 'var(--chart-2)')}
        />
        <StatTile
          label="GPU"
          icon={<Zap />}
          value={pct(s.gpu_usage)}
          chart={spark(history?.gpu, 'var(--chart-3)')}
        />
        {vramTotal > 0 && (
          <StatTile
            label="VRAM"
            value={`${Math.round(vramUsed / 1024)} / ${Math.round(vramTotal / 1024)} GB`}
            chart={
              <Meter value={vramUsed} max={vramTotal} label={`${name} VRAM`} />
            }
          />
        )}
      </div>

      <div className="border-t pt-3">
        <ModelPicker nodeId={id} />
      </div>
    </Card>
  );
}

/** A node that stopped reporting: last-known hardware and a Wake button. */
export function OfflineNodeCard({
  name,
  stats: s,
  power,
}: {
  name: string;
  stats?: NodeStats;
  power?: { busy: boolean; onClick: () => void };
}) {
  return (
    <Card className="flex items-center gap-3">
      <StatusDot status="offline" className="size-2" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate font-medium text-muted-foreground">
            {name}
          </span>
          <Badge>Offline</Badge>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {s
            ? `${specs(s)} · last seen ${relTime(Date.parse(s.last_seen))}`
            : 'Never reported'}
        </p>
      </div>
      {power && <PowerButton name={name} online={false} {...power} />}
    </Card>
  );
}
