import { useMemo } from 'react';
import { Cpu, MemoryStick, HardDrive } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent: string;
  series: { v: number }[];
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  accent,
  series,
}: MetricCardProps) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-4 flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground/80">
          <span style={{ color: accent }}>{icon}</span>
          {label}
        </div>
        <div className="text-right">
          <div
            className="text-lg font-semibold tabular-nums leading-none"
            style={{ color: accent }}>
            {value}
          </div>
          {sub && (
            <div className="text-xs text-muted-foreground/75 tabular-nums mt-1">
              {sub}
            </div>
          )}
        </div>
      </div>
      <div className="h-14 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={series}
            margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`g-${label}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.45} />
                <stop offset="100%" stopColor={accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={[0, 100]} />
            <Area
              type="monotone"
              dataKey="v"
              stroke={accent}
              strokeWidth={1.4}
              fill={`url(#g-${label})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Minimalist host metrics row — 3 sparkline cards (CPU/Mem/Disk). Pulls
 * from the existing /api/system/history time-series so it tracks the Pi
 * itself (not aggregated cluster).
 */
export function HostGraphs() {
  const { systemHistory } = useDashboardData();

  const cpu = useMemo(
    () => systemHistory.map((p) => ({ v: p.cpu })),
    [systemHistory],
  );
  const mem = useMemo(
    () => systemHistory.map((p) => ({ v: p.mem })),
    [systemHistory],
  );
  const disk = useMemo(
    () => systemHistory.map((p) => ({ v: p.disk })),
    [systemHistory],
  );

  const last = systemHistory.at(-1);
  const cpuVal = last ? `${last.cpu.toFixed(0)}%` : '—';
  const memVal = last ? `${last.mem.toFixed(0)}%` : '—';
  const diskVal = last ? `${last.disk.toFixed(0)}%` : '—';
  const memSub = last
    ? `${(last.mem_mb / 1024).toFixed(1)} / ${(last.mem_max / 1024).toFixed(1)} GB`
    : undefined;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <MetricCard
        icon={<Cpu size={13} />}
        label="CPU"
        value={cpuVal}
        accent="#60a5fa"
        series={cpu}
      />
      <MetricCard
        icon={<MemoryStick size={13} />}
        label="Memory"
        value={memVal}
        sub={memSub}
        accent="#a78bfa"
        series={mem}
      />
      <MetricCard
        icon={<HardDrive size={13} />}
        label="Disk"
        value={diskVal}
        accent="#fbbf24"
        series={disk}
      />
    </div>
  );
}
