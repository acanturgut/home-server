import { useState } from 'react';
import { Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Spinner } from '@/components/ui/spinner';
import { ChartLegend } from '@/features/dashboard/components/ChartLegend';
import { usePolling } from '@/hooks/usePolling';
import { formatTime } from '@/lib/format';
import { nodesApi, type NodeRange, type NodeSample } from '@/lib/nodes';

const RANGES: { value: NodeRange; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '168h', label: '7d' },
];

const TEMPS: ChartConfig = {
  cpu_temp: { label: 'CPU', color: 'var(--chart-1)' },
  gpu_temp: { label: 'GPU', color: 'var(--chart-3)' },
  nvme_temp: { label: 'NVMe', color: 'var(--chart-4)' },
};

const LOAD: ChartConfig = {
  cpu: { label: 'CPU', color: 'var(--chart-1)' },
  mem: { label: 'Memory', color: 'var(--chart-2)' },
  gpu: { label: 'GPU', color: 'var(--chart-3)' },
};

const POWER: ChartConfig = {
  cpu_w: { label: 'CPU', color: 'var(--chart-1)' },
  gpu_w: { label: 'GPU', color: 'var(--chart-3)' },
};

/** Samples further apart than this are a gap (node off), not usage. */
const MAX_GAP_MS = 2 * 60_000;

// ponytail: fixed price; move to Settings if it starts changing often.
const KR_PER_KWH = 2.5;
const HOURS_PER_MONTH = 730;

/** CPU + GPU energy over the samples, its cost, and a monthly estimate at the same average draw. */
const powerSummary = (samples: NodeSample[]) => {
  let wh = 0;
  let ms = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = Date.parse(samples[i].t) - Date.parse(samples[i - 1].t);
    if (dt > MAX_GAP_MS) continue;
    wh +=
      (((samples[i].cpu_w ?? 0) + (samples[i].gpu_w ?? 0)) * dt) / 3_600_000;
    ms += dt;
  }
  const kwh = wh / 1000;
  const avgKw = ms ? kwh / (ms / 3_600_000) : 0;
  return `${kwh.toFixed(2)} kWh · ${(kwh * KR_PER_KWH).toFixed(2)} kr · ≈ ${Math.round(
    avgKw * HOURS_PER_MONTH * KR_PER_KWH,
  )} kr/month`;
};

type Row = Record<string, number | undefined> & { ts: number };

/** Only the series this node actually reports (no NVMe on a Mac, no GPU on a Pi). */
const present = (config: ChartConfig, rows: Row[]): ChartConfig =>
  Object.fromEntries(
    Object.entries(config).filter(([key]) => rows.some((r) => r[key])),
  );

/** One line per series over time, with its legend. */
function HistoryChart({
  title,
  config,
  rows,
  range,
  unit,
}: {
  title: string;
  config: ChartConfig;
  rows: Row[];
  range: NodeRange;
  unit: string;
}) {
  const shown = present(config, rows);
  const tick = (t: number) =>
    range === '24h'
      ? formatTime(t)
      : new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        <ChartLegend config={shown} />
      </div>
      <ChartContainer config={shown} className="aspect-auto h-44 w-full">
        <LineChart
          data={rows}
          margin={{ top: 4, right: 16, bottom: 0, left: -12 }}
        >
          <XAxis
            dataKey="ts"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={tick}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            domain={unit === '%' ? [0, 100] : ['auto', 'auto']}
            allowDecimals={false}
            tickFormatter={(v: number) => `${v}${unit}`}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: 'var(--muted)' }}
            labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
            content={
              <ChartTooltipContent
                config={shown}
                formatValue={(v) => `${Math.round(v)}${unit}`}
              />
            }
          />
          {Object.entries(shown).map(([key, c]) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={c.color}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </div>
  );
}

/** A node's temperature and load history plus its latest system warnings. */
export function NodeInsights({ nodeId }: { nodeId: string }) {
  const [range, setRange] = useState<NodeRange>('24h');
  return (
    <div className="space-y-5">
      <SegmentedControl
        size="sm"
        aria-label="History range"
        value={range}
        onValueChange={setRange}
        options={RANGES}
      />
      {/* Keyed so a new range remounts and fetches at once. */}
      <InsightsBody key={range} nodeId={nodeId} range={range} />
    </div>
  );
}

function InsightsBody({ nodeId, range }: { nodeId: string; range: NodeRange }) {
  const [data, setData] = useState<{
    samples: NodeSample[];
    lines: string[];
  } | null>(null);

  // ponytail: refetches the whole range each minute; fine at ≤10k samples.
  usePolling(async () => {
    const [h, l] = await Promise.all([
      nodesApi.history(nodeId, range),
      nodesApi.logs(nodeId),
    ]);
    setData({ samples: h?.samples ?? [], lines: l?.lines ?? [] });
  }, 60_000);

  if (!data) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Spinner label="Loading history" />
      </div>
    );
  }

  const rows: Row[] = data.samples.map(({ t, ...s }) => ({
    ts: Date.parse(t),
    ...s,
  }));
  return (
    <>
      {rows.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          No history yet. A sample is recorded every minute.
        </p>
      ) : (
        <>
          <HistoryChart
            title="Temperature"
            config={TEMPS}
            rows={rows}
            range={range}
            unit="°"
          />
          {rows.some((r) => r.cpu_w || r.gpu_w) && (
            <HistoryChart
              title={`Power (CPU + GPU) · ${powerSummary(data.samples)}`}
              config={POWER}
              rows={rows}
              range={range}
              unit=" W"
            />
          )}
          <HistoryChart
            title="Load"
            config={LOAD}
            rows={rows}
            range={range}
            unit="%"
          />
        </>
      )}
      <div className="space-y-2">
        <p className="text-sm font-medium">Warnings and errors</p>
        {data.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing since the agent started.
          </p>
        ) : (
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap">
            {[...data.lines].reverse().join('\n')}
          </pre>
        )}
      </div>
    </>
  );
}
