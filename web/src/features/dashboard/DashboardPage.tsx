import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { API_BASE } from '@/lib/api';
import { dashboardApi } from '@/features/dashboard/api';
import { guessIcon } from '@/lib/icons';
import type { AppInfo } from '@/lib/types';
import { DashboardPanel } from '@/features/dashboard/components/ServerStats';
import { NodesPanel } from '@/features/dashboard/components/NodesList';
import { StatusDot } from '@/components/ui/status-dot';

const cpuChartConfig: ChartConfig = {
  cpu: { label: 'CPU', color: '#3b82f6' },
};
const memChartConfig: ChartConfig = {
  mem: { label: 'Memory', color: '#a855f7' },
};

function SystemCharts() {
  const [history, setHistory] = useState<
    {
      t: string;
      cpu: number;
      mem: number;
      disk: number;
      mem_mb: number;
      mem_max: number;
    }[]
  >([]);

  useEffect(() => {
    const load = () =>
      dashboardApi.systemHistory().then((d) => {
        if (Array.isArray(d)) setHistory(d);
      });
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  if (history.length < 2) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* CPU chart */}
      <div className="rounded-lg border border-border/30 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">
            CPU Usage
          </span>
          <span className="text-[11px] tabular-nums text-blue-400">
            {history[history.length - 1]?.cpu.toFixed(1)}%
          </span>
        </div>
        <ChartContainer config={cpuChartConfig} className="h-[120px] w-full">
          <AreaChart
            data={history}
            margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
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
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => `${Number(value).toFixed(1)}%`}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="cpu"
              stroke="#3b82f6"
              strokeWidth={1.5}
              fill="url(#cpuGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      </div>

      {/* Memory chart */}
      <div className="rounded-lg border border-border/30 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">
            Memory Usage
          </span>
          <span className="text-[11px] tabular-nums text-purple-400">
            {history[history.length - 1]?.mem.toFixed(1)}%
            <span className="text-muted-foreground/50 ml-1">
              ({history[history.length - 1]?.mem_mb}MB)
            </span>
          </span>
        </div>
        <ChartContainer config={memChartConfig} className="h-[120px] w-full">
          <AreaChart
            data={history}
            margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
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
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => `${Number(value).toFixed(1)}%`}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="mem"
              stroke="#a855f7"
              strokeWidth={1.5}
              fill="url(#memGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
}

/* ── App Store grid for dashboard ── */
function AppsQuickView() {
  const [apps, setApps] = useState<AppInfo[]>([]);
  useEffect(() => {
    dashboardApi.apps().then((d) => setApps(Array.isArray(d) ? d : []));
  }, []);

  if (apps.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground/70">Apps</h3>
        <span className="text-[10px] text-muted-foreground/50">
          {apps.length} deployed
        </span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {apps.map((app) => {
          const icon = app.icon || guessIcon(app.name);
          const isRunning = app.status === 'running';
          const isFailed = app.status === 'failed';
          return (
            <button
              key={app.name}
              onClick={() =>
                isRunning &&
                window.open(`${API_BASE}/apps/${app.name}/`, '_blank')
              }
              className={`group relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                isRunning
                  ? 'border-border/30 hover:border-border/60 hover:bg-muted/20 cursor-pointer'
                  : isFailed
                    ? 'border-red-500/20 opacity-60 cursor-default'
                    : 'border-border/20 opacity-50 cursor-default'
              }`}>
              <span className="text-2xl">{icon}</span>
              <span className="text-[11px] font-medium text-foreground/80 truncate w-full text-center">
                {app.name}
              </span>
              {/* Status dot */}
              <StatusDot
                status={app.status}
                className="absolute top-1.5 right-1.5"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Apps grid on top — app store style */}
      <AppsQuickView />
      {/* System charts */}
      <SystemCharts />
      {/* System info below */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DashboardPanel />
        </div>
        <div className="lg:col-span-3 space-y-6">
          <NodesPanel />
        </div>
      </div>
    </div>
  );
}
