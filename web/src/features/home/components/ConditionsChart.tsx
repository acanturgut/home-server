import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity } from 'lucide-react';
import type { HistoryRange } from '@/features/home/api';
import type { ConditionsView } from '@/features/home/conditions';
import {
  METRIC_META,
  deviceLabel,
  formatMetric,
  type Metric,
} from '@/features/home/deviceMeta';
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { formatTime } from '@/lib/format';

const tick = (ts: number, range: HistoryRange) =>
  range === '24h'
    ? formatTime(ts)
    : new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });

/** One line per sensor for the selected metric. */
export function ConditionsChart({
  view,
  metric,
  range,
  hidden,
  loading,
}: {
  view: ConditionsView;
  metric: Metric;
  range: HistoryRange;
  /** Sensor ids whose line is switched off. */
  hidden: Set<string>;
  loading: boolean;
}) {
  if (view.rows.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center">
        {loading ? (
          <Spinner label="Loading history" />
        ) : (
          <EmptyState
            icon={<Activity />}
            title="No history yet"
            description="Readings are recorded every 5 minutes."
          />
        )}
      </div>
    );
  }
  const config: ChartConfig = Object.fromEntries(
    view.series.map((s) => [
      s.key,
      { label: deviceLabel(s.sensor), color: s.color },
    ]),
  );
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <LineChart
        data={view.rows}
        margin={{ top: 4, right: 16, bottom: 0, left: -12 }}
      >
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="ts"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(t: number) => tick(t, range)}
          tickLine={false}
          axisLine={false}
          minTickGap={40}
        />
        <YAxis
          domain={METRIC_META[metric].domain}
          allowDecimals={false}
          tickFormatter={(v: number) => formatMetric(metric, v, 0)}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip
          cursor={{ stroke: 'var(--border)' }}
          labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
          content={
            <ChartTooltipContent
              config={config}
              formatValue={(v) => formatMetric(metric, v)}
            />
          }
        />
        {view.series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={s.color}
            strokeWidth={1.5}
            dot={false}
            connectNulls
            isAnimationActive={false}
            hide={hidden.has(s.sensor.id)}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
