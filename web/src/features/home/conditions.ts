import type { HomeDevice, SensorSample } from '@/features/home/api';
import { METRICS, readMetric, type Metric } from '@/features/home/deviceMeta';

const BUCKET_MS = 5 * 60 * 1000;
const CHART_COLORS = 5;

export interface Series {
  /** Data key in chart rows (`s0`, `s1`…); device ids aren't safe CSS names. */
  key: string;
  sensor: HomeDevice;
  color: string;
  /** Current reading (live, else last sample) and the range over the period. */
  last: number;
  min: number;
  max: number;
}

type ChartRow = { ts: number } & Record<string, number>;

export interface ConditionsView {
  series: Series[];
  /** One row per 5-minute bucket, keyed by series key. */
  rows: ChartRow[];
  summary: { avg: number; low: Series; high: Series } | null;
}

/** Metrics at least one sensor currently reports, in display order. */
export function availableMetrics(sensors: HomeDevice[]): Metric[] {
  return METRICS.filter((m) => sensors.some((s) => readMetric(s, m) != null));
}

/** Chart rows, per-sensor stats and the cross-sensor summary for `metric`. */
export function conditionsView(
  sensors: HomeDevice[],
  history: Record<string, SensorSample[]>,
  metric: Metric,
): ConditionsView {
  const series: Series[] = [];
  const buckets = new Map<number, ChartRow>();
  for (const sensor of sensors) {
    const key = `s${series.length}`;
    const values: number[] = [];
    for (const p of history[sensor.id] ?? []) {
      const v = readMetric(p, metric);
      if (v == null) continue;
      values.push(v);
      const ts = Math.round(new Date(p.t).getTime() / BUCKET_MS) * BUCKET_MS;
      let row = buckets.get(ts);
      if (!row) buckets.set(ts, (row = { ts } as ChartRow));
      row[key] = v;
    }
    const live = readMetric(sensor, metric);
    if (live != null) values.push(live);
    if (values.length === 0) continue;
    series.push({
      key,
      sensor,
      color: `var(--chart-${(series.length % CHART_COLORS) + 1})`,
      last: live ?? values[values.length - 1],
      min: Math.min(...values),
      max: Math.max(...values),
    });
  }
  const summary =
    series.length === 0
      ? null
      : {
          avg: series.reduce((sum, s) => sum + s.last, 0) / series.length,
          low: series.reduce((a, s) => (s.last < a.last ? s : a)),
          high: series.reduce((a, s) => (s.last > a.last ? s : a)),
        };
  return {
    series,
    rows: [...buckets.values()].sort((a, b) => a.ts - b.ts),
    summary,
  };
}
