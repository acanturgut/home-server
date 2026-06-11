import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';

const PIE_COLORS = [
  '#60a5fa',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#22d3ee',
  '#f472b6',
];

/** Cluster overview: route distribution donut + node activity bars.
 * All derived client-side from the recent log buffer. (Top-models view
 * lives in ModelLeaderboard now to avoid duplication.) */
export function ClusterOverview() {
  const { logs } = useDashboardData();

  // Route mix (high-end / low-end / local / fallback)
  const routeData = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach((l) => {
      const tier = l.tier || (l.route === 'local' ? 'local' : 'unknown');
      counts[tier] = (counts[tier] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [logs]);

  // Model usage handled by ModelLeaderboard component (was here previously).

  // Node usage bars
  const nodeData = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach((l) => {
      if (!l.node) return;
      counts[l.node] = (counts[l.node] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [logs]);

  const routeConfig: ChartConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    routeData.forEach((r, i) => {
      cfg[r.name] = { label: r.name, color: PIE_COLORS[i % PIE_COLORS.length] };
    });
    return cfg;
  }, [routeData]);

  const nodeConfig: ChartConfig = {
    count: { label: 'Requests', color: '#a78bfa' },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* Route distribution donut */}
      <div className="rounded-xl border border-border/40 bg-card/40 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-foreground/80">
              Route Mix
            </p>
            <p className="text-xs text-muted-foreground/60">
              Where requests are landing
            </p>
          </div>
          <span className="text-xs text-muted-foreground/65 tabular-nums">
            {logs.length} req
          </span>
        </div>
        {routeData.length > 0 ? (
          <ChartContainer config={routeConfig} className="h-[180px] w-full">
            <PieChart>
              <Pie
                data={routeData}
                dataKey="value"
                nameKey="name"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={2}
                stroke="none">
                {routeData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
            </PieChart>
          </ChartContainer>
        ) : (
          <EmptyChart label="No requests yet" />
        )}
        <div className="flex flex-wrap gap-2 text-xs">
          {routeData.map((r, i) => (
            <span
              key={r.name}
              className="flex items-center gap-1 text-muted-foreground/80">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
              />
              {r.name}{' '}
              <span className="tabular-nums text-muted-foreground/70">
                {r.value}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Top models card removed — ModelLeaderboard supersedes it. */}

      {/* Node activity */}
      <div className="rounded-xl border border-border/40 bg-card/40 p-3 space-y-2">
        <div>
          <p className="text-xs font-medium text-foreground/80">
            Node Activity
          </p>
          <p className="text-xs text-muted-foreground/60">
            Requests served per node
          </p>
        </div>
        {nodeData.length > 0 ? (
          <ChartContainer config={nodeConfig} className="h-[180px] w-full">
            <BarChart
              data={nodeData}
              margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid
                vertical={false}
                stroke="hsl(var(--border))"
                strokeOpacity={0.15}
              />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="count"
                fill="#a78bfa"
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ChartContainer>
        ) : (
          <EmptyChart label="No node activity" />
        )}
      </div>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground/65 italic">
      {label}
    </div>
  );
}
