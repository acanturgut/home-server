import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHeader } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { EmptyState } from '@/components/ui/empty-state';
import { ChartLegend } from '@/features/dashboard/components/ChartLegend';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';
import { formatCompact as fmt, formatTime, plural } from '@/lib/format';

const cfg = {
  prompt: { label: 'Prompt', color: 'var(--chart-1)' },
  completion: { label: 'Completion', color: 'var(--chart-2)' },
} satisfies ChartConfig;

interface TokenStats {
  total: number;
  prompt: number;
  completion: number;
  requests: number;
  avg: number;
  perMinute: { t: string; prompt: number; completion: number }[];
}

/** Token totals plus per-minute prompt / completion bars (per model: ModelLeaderboard). */
export function TokenUsage() {
  const { logs } = useDashboardData();

  const stats = useMemo<TokenStats>(() => {
    let total = 0;
    let prompt = 0;
    let completion = 0;
    let requests = 0;
    const byMinute = new Map<number, { p: number; c: number }>();
    logs.forEach((l) => {
      const tt = l.total_tokens || 0;
      const pt = l.prompt_tokens || 0;
      const ct = l.completion_tokens || 0;
      if (tt === 0 && pt === 0 && ct === 0) return;
      total += tt || pt + ct;
      prompt += pt;
      completion += ct;
      requests += 1;
      if (l.timestamp) {
        const minute =
          Math.floor(new Date(l.timestamp).getTime() / 60000) * 60000;
        const b = byMinute.get(minute) || { p: 0, c: 0 };
        b.p += pt;
        b.c += ct;
        byMinute.set(minute, b);
      }
    });
    return {
      total,
      prompt,
      completion,
      requests,
      avg: requests > 0 ? total / requests : 0,
      perMinute: Array.from(byMinute.entries())
        .sort(([a], [b]) => a - b)
        .map(([t, v]) => ({
          t: formatTime(t),
          prompt: v.p,
          completion: v.c,
        })),
    };
  }, [logs]);

  return (
    <Card className="space-y-3">
      <CardHeader
        title="Token usage"
        description={`${fmt(stats.total)} total · ${plural(stats.requests, 'request')} · avg ${fmt(Math.round(stats.avg))} per request`}
        actions={<ChartLegend config={cfg} />}
      />
      {stats.perMinute.length >= 2 ? (
        <ChartContainer config={cfg} className="aspect-auto h-40 w-full">
          <BarChart
            data={stats.perMinute}
            margin={{ top: 4, right: 4, bottom: 0, left: -16 }}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="t"
              tickLine={false}
              axisLine={false}
              minTickGap={40}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => fmt(v)}
            />
            <Tooltip
              cursor={{ fill: 'var(--muted)', fillOpacity: 0.5 }}
              content={<ChartTooltipContent config={cfg} formatValue={fmt} />}
            />
            <Bar
              dataKey="prompt"
              stackId="t"
              fill={cfg.prompt.color}
              isAnimationActive={false}
            />
            <Bar
              dataKey="completion"
              stackId="t"
              fill={cfg.completion.color}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartContainer>
      ) : (
        <EmptyState title="No token data yet" className="h-40" />
      )}
    </Card>
  );
}
