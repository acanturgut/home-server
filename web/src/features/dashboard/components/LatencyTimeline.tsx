import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';

const cfg: ChartConfig = {
  highEnd: { label: 'high-end', color: '#60a5fa' },
  lowEnd: { label: 'low-end', color: '#a78bfa' },
  local: { label: 'local', color: '#34d399' },
};

/** Latency timeline binned by minute, stacked by tier. */
export function LatencyTimeline() {
  const { logs } = useDashboardData();

  const series = useMemo(() => {
    const buckets = new Map<
      number,
      { highEnd: number[]; lowEnd: number[]; local: number[] }
    >();
    logs.forEach((l) => {
      if (!l.latency || !l.timestamp) return;
      const ms = parseLatency(l.latency);
      if (ms == null) return;
      const minute =
        Math.floor(new Date(l.timestamp).getTime() / 60000) * 60000;
      const b = buckets.get(minute) || { highEnd: [], lowEnd: [], local: [] };
      const key = (
        l.tier === 'high-end'
          ? 'highEnd'
          : l.tier === 'low-end'
            ? 'lowEnd'
            : 'local'
      ) as 'highEnd' | 'lowEnd' | 'local';
      b[key].push(ms);
      buckets.set(minute, b);
    });
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([t, b]) => ({
        t: new Date(t).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        highEnd: avg(b.highEnd),
        lowEnd: avg(b.lowEnd),
        local: avg(b.local),
      }));
  }, [logs]);

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-foreground/80">
            Request Latency Over Time
          </p>
          <p className="text-xs text-muted-foreground/60">
            Average ms per minute, by tier
          </p>
        </div>
        <div className="flex gap-3 text-xs">
          {Object.entries(cfg).map(([k, v]) => (
            <span
              key={k}
              className="flex items-center gap-1 text-muted-foreground/70">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: v.color }}
              />
              {v.label}
            </span>
          ))}
        </div>
      </div>
      {series.length >= 2 ? (
        <ChartContainer config={cfg} className="h-[180px] w-full">
          <AreaChart
            data={series}
            margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <defs>
              {(['highEnd', 'lowEnd', 'local'] as const).map((k) => (
                <linearGradient
                  key={k}
                  id={`lat-${k}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1">
                  <stop
                    offset="0%"
                    stopColor={cfg[k].color}
                    stopOpacity={0.35}
                  />
                  <stop
                    offset="100%"
                    stopColor={cfg[k].color}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
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
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                v > 1000 ? `${(v / 1000).toFixed(1)}s` : `${v.toFixed(0)}`
              }
            />
            <Tooltip
              cursor={{ stroke: 'hsl(var(--border))', strokeOpacity: 0.4 }}
              contentStyle={{
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(value, name) => {
                const v = Number(value);
                return [
                  v > 1000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(0)}ms`,
                  String(name),
                ];
              }}
            />
            <Area
              type="monotone"
              dataKey="highEnd"
              stroke={cfg.highEnd.color}
              strokeWidth={1.5}
              fill="url(#lat-highEnd)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="lowEnd"
              stroke={cfg.lowEnd.color}
              strokeWidth={1.5}
              fill="url(#lat-lowEnd)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="local"
              stroke={cfg.local.color}
              strokeWidth={1.5}
              fill="url(#lat-local)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      ) : (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground/65 italic">
          Not enough latency data yet
        </div>
      )}
    </div>
  );
}

function parseLatency(s: string): number | null {
  if (!s) return null;
  if (s.endsWith('ms')) return parseFloat(s);
  if (s.endsWith('µs') || s.endsWith('us')) return parseFloat(s) / 1000;
  if (s.endsWith('s')) return parseFloat(s) * 1000;
  return null;
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
