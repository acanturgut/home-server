import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Thermometer,
  Droplets,
  Wind,
  Activity,
  Battery,
  TrendingUp,
  RefreshCw,
  Snowflake,
  Flame,
  Pencil,
} from 'lucide-react';
import {
  homeApi,
  type HomeDevice,
  type SensorSample,
} from '@/features/home/api';

type Range = '24h' | '7d' | '30d';
type Metric = 'temp' | 'humidity' | 'pm25' | 'voc' | 'battery';

const RANGES: { id: Range; label: string }[] = [
  { id: '24h', label: '24 h' },
  { id: '7d', label: '7 d' },
  { id: '30d', label: '30 d' },
];

interface MetricMeta {
  label: string;
  short: string;
  icon: React.ReactNode;
  accent: string;
  unit: string;
  fixed: number;
  domain: [number | 'auto', number | 'auto'];
}

const METRIC_META: Record<Metric, MetricMeta> = {
  temp: {
    label: 'Temperature',
    short: 'Temp',
    icon: <Thermometer size={12} />,
    accent: '#f59e0b',
    unit: '°',
    fixed: 1,
    domain: ['auto', 'auto'],
  },
  humidity: {
    label: 'Humidity',
    short: 'Humidity',
    icon: <Droplets size={12} />,
    accent: '#60a5fa',
    unit: '%',
    fixed: 0,
    domain: [0, 100],
  },
  pm25: {
    label: 'PM2.5',
    short: 'PM2.5',
    icon: <Wind size={12} />,
    accent: '#a3a3a3',
    unit: '',
    fixed: 0,
    domain: [0, 'auto'],
  },
  voc: {
    label: 'VOC',
    short: 'VOC',
    icon: <Activity size={12} />,
    accent: '#a78bfa',
    unit: '',
    fixed: 0,
    domain: [0, 'auto'],
  },
  battery: {
    label: 'Battery',
    short: 'Battery',
    icon: <Battery size={12} />,
    accent: '#34d399',
    unit: '%',
    fixed: 0,
    domain: [0, 100],
  },
};

const LINE_PALETTE = [
  '#f59e0b',
  '#60a5fa',
  '#a78bfa',
  '#34d399',
  '#f472b6',
  '#22d3ee',
  '#fb7185',
  '#facc15',
  '#94d3a2',
  '#c084fc',
];

interface Props {
  sensors: HomeDevice[];
  onEdit: (d: HomeDevice) => void;
}

/**
 * ConditionsCard — single, unified surface for sensor data.
 *
 * Replaces the previous "Insights + Band + Trends" trio. Layout:
 *   ┌ header: metric & range tabs, refresh ──────────────────┐
 *   │ insight ribbon: avg · coldest · warmest ───────────────│
 *   │ history chart (one line per sensor) ───────────────────│
 *   │ sensor tiles: current value of selected metric +       │
 *   │   secondary readings; click to toggle line on chart    │
 *   └────────────────────────────────────────────────────────┘
 */
export function ConditionsCard({ sensors, onEdit }: Props) {
  const eligibleSensors = useMemo(
    () => sensors.filter((s) => s.type === 'sensor'),
    [sensors],
  );

  const availableMetrics = useMemo(() => {
    const set = new Set<Metric>();
    for (const s of eligibleSensors) {
      if (s.temp != null) set.add('temp');
      if (s.humidity != null) set.add('humidity');
      if (s.pm25 != null) set.add('pm25');
      if (s.voc != null) set.add('voc');
      if (s.battery != null) set.add('battery');
    }
    const order: Metric[] = ['temp', 'humidity', 'pm25', 'voc', 'battery'];
    return order.filter((m) => set.has(m));
  }, [eligibleSensors]);

  const [metric, setMetric] = useState<Metric>(
    () => availableMetrics[0] ?? 'temp',
  );
  useEffect(() => {
    if (!availableMetrics.includes(metric) && availableMetrics[0]) {
      setMetric(availableMetrics[0]);
    }
  }, [availableMetrics, metric]);

  const [range, setRange] = useState<Range>('24h');
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const [history, setHistory] = useState<Record<string, SensorSample[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensorKey = eligibleSensors.map((s) => s.id).join('|');
  const lastFetchKey = useRef<string>('');

  const fetchAll = useMemo(
    () => async () => {
      if (eligibleSensors.length === 0) return;
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all(
          eligibleSensors.map((s) =>
            homeApi
              .history(s.id, range)
              .then((r) => ({ id: s.id, samples: r?.samples ?? [] }))
              .catch(() => ({ id: s.id, samples: [] as SensorSample[] })),
          ),
        );
        const next: Record<string, SensorSample[]> = {};
        for (const r of results) next[r.id] = r.samples;
        setHistory(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [eligibleSensors, range],
  );

  useEffect(() => {
    const key = `${range}|${sensorKey}`;
    if (key === lastFetchKey.current) return;
    lastFetchKey.current = key;
    fetchAll();
  }, [fetchAll, range, sensorKey]);

  // Sensors that report the selected metric (live or in history).
  const seriesSensors = useMemo(() => {
    return eligibleSensors.filter((s) => {
      const samples = history[s.id] ?? [];
      if (samples.some((p) => readMetric(p, metric) != null)) return true;
      return readDeviceMetric(s, metric) != null;
    });
  }, [eligibleSensors, history, metric]);

  // Build merged dataset bucketed to 5 min for clean alignment.
  const chartData = useMemo(() => {
    const map = new Map<number, Record<string, number | null | string>>();
    for (const s of seriesSensors) {
      for (const p of history[s.id] ?? []) {
        const v = readMetric(p, metric);
        if (v == null) continue;
        const t = new Date(p.t).getTime();
        const bucket = Math.round(t / (5 * 60 * 1000)) * (5 * 60 * 1000);
        let row = map.get(bucket);
        if (!row) {
          row = { ts: bucket };
          map.set(bucket, row);
        }
        row[s.id] = v;
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => (a.ts as number) - (b.ts as number),
    );
  }, [history, seriesSensors, metric]);

  // Per-sensor stats (last + min/max/avg) over the loaded range.
  const sensorStats = useMemo(() => {
    const out: Record<
      string,
      { min: number; max: number; avg: number; last: number } | null
    > = {};
    for (const s of seriesSensors) {
      const vals: number[] = [];
      let last: number | null = null;
      for (const p of history[s.id] ?? []) {
        const v = readMetric(p, metric);
        if (v != null) {
          vals.push(v);
          last = v;
        }
      }
      if (last == null) {
        const liveVal = readDeviceMetric(s, metric);
        if (liveVal != null) {
          out[s.id] = {
            min: liveVal,
            max: liveVal,
            avg: liveVal,
            last: liveVal,
          };
          continue;
        }
        out[s.id] = null;
        continue;
      }
      let min = vals[0];
      let max = vals[0];
      let sum = 0;
      for (const v of vals) {
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
      }
      out[s.id] = { min, max, avg: sum / vals.length, last };
    }
    return out;
  }, [seriesSensors, history, metric]);

  // Cross-sensor extremes for the insight ribbon.
  const insight = useMemo(() => {
    const live: { s: HomeDevice; v: number }[] = [];
    for (const s of seriesSensors) {
      const v = sensorStats[s.id]?.last;
      if (v != null) live.push({ s, v });
    }
    if (live.length === 0) return null;
    let avg = 0;
    let coldest = live[0];
    let warmest = live[0];
    for (const x of live) {
      avg += x.v;
      if (x.v < coldest.v) coldest = x;
      if (x.v > warmest.v) warmest = x;
    }
    avg /= live.length;
    return { avg, coldest, warmest, n: live.length };
  }, [seriesSensors, sensorStats]);

  const colorFor = useMemo(() => {
    const map: Record<string, string> = {};
    seriesSensors.forEach((s, i) => {
      map[s.id] = LINE_PALETTE[i % LINE_PALETTE.length];
    });
    return map;
  }, [seriesSensors]);

  const meta = METRIC_META[metric];

  const fmtTime = (t: number) => {
    const d = new Date(t);
    if (range === '24h') {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (eligibleSensors.length === 0) return null;

  const noChartData = chartData.length === 0;

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/30">
        <span className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-foreground/85 font-medium">
          <TrendingUp size={12} className="text-[#a78bfa]" />
          Conditions
        </span>
        <span className="text-[11px] text-muted-foreground/65 tabular-nums">
          · {eligibleSensors.length} sensor
          {eligibleSensors.length === 1 ? '' : 's'}
        </span>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex rounded-md border border-border/30 overflow-hidden">
            {availableMetrics.map((m) => {
              const mm = METRIC_META[m];
              const active = m === metric;
              return (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  title={mm.label}
                  className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors ${
                    active
                      ? 'bg-white/[0.08]'
                      : 'text-muted-foreground/70 hover:text-foreground/85 hover:bg-white/[0.04]'
                  }`}
                  style={active ? { color: mm.accent } : undefined}>
                  {mm.icon}
                  <span className="hidden sm:inline">{mm.short}</span>
                </button>
              );
            })}
          </div>
          <div className="flex rounded-md border border-border/30 overflow-hidden">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`px-2 py-1 text-xs transition-colors ${
                  range === r.id
                    ? 'bg-white/[0.08] text-foreground/95'
                    : 'text-muted-foreground/70 hover:text-foreground/85 hover:bg-white/[0.04]'
                }`}>
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={fetchAll}
            title="Refresh"
            disabled={loading}
            className="p-1.5 rounded-md border border-border/30 text-muted-foreground/70 hover:text-foreground/95 hover:bg-white/[0.04] disabled:opacity-50">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Insight ribbon */}
      {insight && (
        <div className="px-3 py-2 border-b border-border/30 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground/65 uppercase tracking-wider text-[10px]">
              Avg
            </span>
            <span
              className="font-semibold tabular-nums"
              style={{ color: meta.accent }}>
              {insight.avg.toFixed(meta.fixed)}
              {meta.unit}
            </span>
          </div>
          {insight.coldest.s.id !== insight.warmest.s.id && (
            <>
              <div className="flex items-center gap-1.5">
                <Snowflake size={11} className="text-sky-300" />
                <span className="text-muted-foreground/75 truncate max-w-[140px]">
                  {locationLabel(insight.coldest.s)}
                </span>
                <span className="font-medium tabular-nums text-sky-200">
                  {insight.coldest.v.toFixed(meta.fixed)}
                  {meta.unit}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Flame size={11} className="text-orange-300" />
                <span className="text-muted-foreground/75 truncate max-w-[140px]">
                  {locationLabel(insight.warmest.s)}
                </span>
                <span className="font-medium tabular-nums text-orange-200">
                  {insight.warmest.v.toFixed(meta.fixed)}
                  {meta.unit}
                </span>
              </div>
            </>
          )}
          <div className="flex-1" />
          {hidden.size > 0 && (
            <button
              onClick={() => setHidden(new Set())}
              className="text-[10px] text-muted-foreground/70 hover:text-foreground/95">
              Show all ({hidden.size} hidden)
            </button>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="px-2 pt-3">
        <div className="h-56">
          {noChartData ? (
            <div className="h-full flex flex-col items-center justify-center text-xs text-muted-foreground/65 gap-1">
              <Activity size={20} className="opacity-40" />
              <span>
                {loading
                  ? 'Loading history…'
                  : error
                    ? error
                    : 'No samples yet — readings are recorded every 5 min.'}
              </span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={fmtTime}
                  tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)' }}
                  stroke="rgba(255,255,255,0.1)"
                  minTickGap={40}
                />
                <YAxis
                  domain={meta.domain as [number, number]}
                  tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)' }}
                  stroke="rgba(255,255,255,0.1)"
                  width={36}
                  tickFormatter={(v) =>
                    metric === 'temp'
                      ? `${Math.round(v)}°`
                      : metric === 'humidity' || metric === 'battery'
                        ? `${v}%`
                        : String(v)
                  }
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(20,20,24,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                  labelFormatter={(t) =>
                    new Date(t as number).toLocaleString()
                  }
                  formatter={(value, name) => {
                    if (value == null) return ['—', name];
                    const sensor = seriesSensors.find((s) => s.id === name);
                    const label = sensor
                      ? sensor.display_name || sensor.name
                      : String(name);
                    return [
                      `${(value as number).toFixed(meta.fixed)}${meta.unit}`,
                      label,
                    ];
                  }}
                />
                {seriesSensors.map((s) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.id}
                    stroke={colorFor[s.id]}
                    strokeWidth={1.6}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                    hide={hidden.has(s.id)}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Sensor tiles — current value (selected metric) + secondary readings */}
      <div className="p-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {seriesSensors.map((s) => {
          const stats = sensorStats[s.id];
          const isHidden = hidden.has(s.id);
          const color = colorFor[s.id];
          return (
            <div
              key={s.id}
              className={`group relative rounded-md border transition-colors ${
                isHidden
                  ? 'border-border/20 bg-background/20 opacity-60'
                  : 'border-border/30 bg-background/40'
              }`}>
              <button
                type="button"
                onClick={() => {
                  setHidden((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.id)) next.delete(s.id);
                    else next.add(s.id);
                    return next;
                  });
                }}
                className="w-full text-left p-2.5"
                title={isHidden ? 'Click to show on chart' : 'Click to hide'}>
                <div className="flex items-start gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                    style={{ background: color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-foreground/95 truncate font-medium">
                        {s.display_name || s.name}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground/65 truncate">
                      {locationLabel(s)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className="text-base font-semibold tabular-nums leading-none"
                      style={{ color }}>
                      {stats
                        ? `${stats.last.toFixed(meta.fixed)}${meta.unit}`
                        : '—'}
                    </div>
                    {stats && stats.min !== stats.max && (
                      <div className="text-[10px] text-muted-foreground/55 tabular-nums mt-0.5">
                        {stats.min.toFixed(meta.fixed)}–
                        {stats.max.toFixed(meta.fixed)}
                        {meta.unit}
                      </div>
                    )}
                  </div>
                </div>

                {/* Secondary readings — every other metric this sensor exposes */}
                <SecondaryReadings sensor={s} hideMetric={metric} />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(s);
                }}
                title="Edit"
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-70 hover:opacity-100! transition-opacity p-1 rounded bg-background/60 text-muted-foreground hover:text-foreground">
                <Pencil size={10} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Secondary readings row inside each tile ---------------------------

function SecondaryReadings({
  sensor,
  hideMetric,
}: {
  sensor: HomeDevice;
  hideMetric: Metric;
}) {
  const items: { key: Metric; value: string; color: string }[] = [];
  const push = (key: Metric, raw: number | undefined | null) => {
    if (raw == null || key === hideMetric) return;
    const m = METRIC_META[key];
    items.push({
      key,
      value: `${raw.toFixed(m.fixed)}${m.unit}`,
      color: m.accent,
    });
  };
  push('temp', sensor.temp);
  push('humidity', sensor.humidity);
  push('pm25', sensor.pm25);
  push('voc', sensor.voc);
  push('battery', sensor.battery);

  if (items.length === 0 && sensor.reachable) return null;

  return (
    <div className="mt-1.5 pl-4 flex items-center gap-2 text-[10px] text-muted-foreground/70">
      {items.map((it) => {
        const m = METRIC_META[it.key];
        return (
          <span key={it.key} className="flex items-center gap-0.5">
            <span style={{ color: it.color }}>{m.icon}</span>
            <span className="tabular-nums">{it.value}</span>
          </span>
        );
      })}
      {!sensor.reachable && (
        <span className="text-amber-400/70">offline</span>
      )}
    </div>
  );
}

// ---- helpers ------------------------------------------------------------

function readMetric(s: SensorSample, m: Metric): number | null {
  const v = s[m];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readDeviceMetric(d: HomeDevice, m: Metric): number | null {
  const v = d[m];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function locationLabel(d: HomeDevice): string {
  return d.room?.trim() || 'Unassigned';
}
