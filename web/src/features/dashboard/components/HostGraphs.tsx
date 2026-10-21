import { Cpu, HardDrive, MemoryStick } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Sparkline } from '@/components/ui/chart';
import { StatTile } from '@/components/ui/stat-tile';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';

const METRICS = [
  { key: 'cpu', label: 'CPU', icon: <Cpu />, color: 'var(--chart-1)' },
  {
    key: 'mem',
    label: 'Memory',
    icon: <MemoryStick />,
    color: 'var(--chart-2)',
  },
  { key: 'disk', label: 'Disk', icon: <HardDrive />, color: 'var(--chart-3)' },
] as const;

/** Home server (Pi) CPU / memory / disk with the last 5 minutes as sparklines. */
export function HostGraphs() {
  const { systemHistory } = useDashboardData();
  const last = systemHistory.at(-1);
  const memSub =
    last &&
    `${(last.mem_mb / 1024).toFixed(1)} / ${(last.mem_max / 1024).toFixed(1)} GB`;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {METRICS.map((m) => (
        <Card key={m.key}>
          <StatTile
            label={m.label}
            icon={m.icon}
            value={last ? `${last[m.key].toFixed(0)}%` : '—'}
            sub={m.key === 'mem' ? memSub : undefined}
            chart={
              <Sparkline
                data={systemHistory.map((p) => p[m.key])}
                color={m.color}
                max={100}
                className="h-14"
              />
            }
          />
        </Card>
      ))}
    </div>
  );
}
