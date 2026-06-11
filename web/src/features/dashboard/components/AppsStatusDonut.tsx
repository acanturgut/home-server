import { useMemo } from 'react';
import { Cell, Pie, PieChart } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';

const STATUS_COLORS: Record<string, string> = {
  running: '#34d399',
  stopped: '#94a3b8',
  failed: '#f87171',
  building: '#fbbf24',
  pending: '#a78bfa',
};

/** Apps status donut + most-recent build list. */
export function AppsStatusDonut() {
  const { apps } = useDashboardData();

  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    apps.forEach((a) => {
      const k = (a.status || 'unknown').toLowerCase();
      counts[k] = (counts[k] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [apps]);

  const recentBuilds = useMemo(() => {
    return apps
      .flatMap((a) =>
        (a.builds || []).map((b) => ({ ...b, app: a.name, icon: a.icon })),
      )
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, 6);
  }, [apps]);

  const cfg: ChartConfig = useMemo(() => {
    const c: ChartConfig = {};
    data.forEach((d) => {
      c[d.name] = { label: d.name, color: STATUS_COLORS[d.name] || '#94a3b8' };
    });
    return c;
  }, [data]);

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-3 space-y-2">
      <div>
        <p className="text-xs font-medium text-foreground/80">
          Apps Status
        </p>
        <p className="text-xs text-muted-foreground/60">
          {apps.length} app{apps.length === 1 ? '' : 's'} deployed
        </p>
      </div>
      {data.length > 0 ? (
        <ChartContainer config={cfg} className="h-[160px] w-full">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={42}
              outerRadius={70}
              paddingAngle={2}
              stroke="none">
              {data.map((d, i) => (
                <Cell key={i} fill={STATUS_COLORS[d.name] || '#94a3b8'} />
              ))}
            </Pie>
            <ChartTooltip content={<ChartTooltipContent />} />
          </PieChart>
        </ChartContainer>
      ) : (
        <div className="h-[160px] flex items-center justify-center text-xs text-muted-foreground/65 italic">
          No apps yet
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-xs">
        {data.map((d) => (
          <span
            key={d.name}
            className="flex items-center gap-1 text-muted-foreground/80">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[d.name] || '#94a3b8' }}
            />
            {d.name}{' '}
            <span className="tabular-nums text-muted-foreground/70">
              {d.value}
            </span>
          </span>
        ))}
      </div>
      {recentBuilds.length > 0 && (
        <div className="pt-2 border-t border-border/10 space-y-1">
          <p className="text-xs text-muted-foreground/60 uppercase tracking-wider">
            Recent builds
          </p>
          {recentBuilds.map((b, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-base">{b.icon || '📦'}</span>
              <span className="text-foreground/80 truncate flex-1 min-w-0">
                {b.app}
              </span>
              <span
                className={`font-mono ${
                  b.status === 'done' || b.status === 'success'
                    ? 'text-emerald-400/80'
                    : b.status === 'error' || b.status === 'failed'
                      ? 'text-red-400/80'
                      : 'text-muted-foreground/60'
                }`}>
                {b.action}
              </span>
              <span className="text-muted-foreground/65 tabular-nums shrink-0">
                {b.duration}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
