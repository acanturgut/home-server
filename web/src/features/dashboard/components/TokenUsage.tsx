import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';

const cfg: ChartConfig = {
  prompt: { label: 'prompt', color: '#60a5fa' },
  completion: { label: 'completion', color: '#34d399' },
};

interface TokenStats {
  total: number;
  prompt: number;
  completion: number;
  requests: number;
  avg: number;
  perMinute: { t: string; prompt: number; completion: number }[];
}

/** Token usage analytics: aggregate counters + per-minute stacked bars.
 * (per-model + per-tier breakdowns live in ModelLeaderboard / ClusterOverview
 * to avoid duplicate data.) */
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
          t: new Date(t).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          prompt: v.p,
          completion: v.c,
        })),
    };
  }, [logs]);

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-foreground/80">
            Token Usage
          </p>
          <p className="text-xs text-muted-foreground/60">
            {fmt(stats.total)} total · {stats.requests} req · avg{' '}
            {fmt(Math.round(stats.avg))}/req
          </p>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground/80">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: cfg.prompt.color }}
            />
            prompt{' '}
            <span className="tabular-nums text-muted-foreground/60">
              {fmt(stats.prompt)}
            </span>
          </span>
          <span className="flex items-center gap-1 text-muted-foreground/80">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: cfg.completion.color }}
            />
            completion{' '}
            <span className="tabular-nums text-muted-foreground/60">
              {fmt(stats.completion)}
            </span>
          </span>
        </div>
      </div>
      <div>
        {/* Timeline (stacked bars) */}
        {stats.perMinute.length >= 2 ? (
          <ChartContainer config={cfg} className="h-[160px] w-full">
            <BarChart
              data={stats.perMinute}
              margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
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
                tickFormatter={(v: number) => fmt(v)}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--border))', fillOpacity: 0.1 }}
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(value, name) => [fmt(Number(value)), String(name)]}
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
          <Empty />
        )}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="h-[160px] flex items-center justify-center text-xs text-muted-foreground/65 italic">
      No token data yet
    </div>
  );
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}
