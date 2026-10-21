import { useMemo } from 'react';
import { Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHeader } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { EmptyState } from '@/components/ui/empty-state';
import { ChartLegend } from '@/features/dashboard/components/ChartLegend';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';
import { formatLatency, formatTime, parseLatency } from '@/lib/format';

const cfg = {
  highEnd: { label: 'high-end', color: 'var(--chart-1)' },
  lowEnd: { label: 'low-end', color: 'var(--chart-2)' },
  local: { label: 'local', color: 'var(--chart-3)' },
} satisfies ChartConfig;

/** Average request latency per minute, one line per tier. */
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
        t: formatTime(t),
        highEnd: avg(b.highEnd),
        lowEnd: avg(b.lowEnd),
        local: avg(b.local),
      }));
  }, [logs]);

  return (
    <Card className="space-y-3">
      <CardHeader
        title="Request latency"
        description="Average per minute, by tier"
        actions={<ChartLegend config={cfg} />}
      />
      {series.length >= 2 ? (
        <ChartContainer config={cfg} className="aspect-auto h-44 w-full">
          <LineChart
            data={series}
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
          >
            <XAxis
              dataKey="t"
              tickLine={false}
              axisLine={false}
              minTickGap={40}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => (v > 0 ? formatLatency(v) : '0')}
            />
            <Tooltip
              cursor={{ stroke: 'var(--muted)' }}
              content={
                <ChartTooltipContent config={cfg} formatValue={formatLatency} />
              }
            />
            {(Object.keys(cfg) as (keyof typeof cfg)[]).map((k) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                stroke={cfg[k].color}
                strokeWidth={1.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      ) : (
        <EmptyState title="Not enough latency data yet" className="h-44" />
      )}
    </Card>
  );
}

/** Mean, or undefined for an empty bucket so the line skips that minute. */
function avg(xs: number[]): number | undefined {
  if (xs.length === 0) return undefined;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
