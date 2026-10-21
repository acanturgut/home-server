import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Pencil,
  TrendingUp,
} from 'lucide-react';
import type { HistoryRange, HomeDevice } from '@/features/home/api';
import {
  availableMetrics,
  conditionsView,
  type ConditionsView,
  type Series,
} from '@/features/home/conditions';
import {
  METRIC_META,
  TONE_TEXT,
  deviceLabel,
  formatMetric,
  metricTone,
  roomOf,
  type Metric,
} from '@/features/home/deviceMeta';
import { useSensorHistory } from '@/features/home/hooks/useSensorHistory';
import { ConditionsChart } from '@/features/home/components/ConditionsChart';
import { Readings } from '@/features/home/components/Readings';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StatTile } from '@/components/ui/stat-tile';
import { plural } from '@/lib/format';
import { cn } from '@/lib/utils';

const RANGES: { value: HistoryRange; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

/** Sensor readings: metric and range pickers, summary, history chart, one tile per sensor. */
export function ConditionsCard({
  sensors,
  onEdit,
}: {
  sensors: HomeDevice[];
  onEdit: (d: HomeDevice) => void;
}) {
  const metrics = useMemo(() => availableMetrics(sensors), [sensors]);
  const [picked, setMetric] = useState<Metric>('temp');
  const metric = metrics.includes(picked) ? picked : (metrics[0] ?? picked);
  const [range, setRange] = useState<HistoryRange>('24h');
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const { history, loading, reload } = useSensorHistory(
    sensors.map((s) => s.id),
    range,
  );
  const view = useMemo(
    () => conditionsView(sensors, history, metric),
    [sensors, history, metric],
  );

  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <Card className="space-y-4">
      <CardHeader
        icon={<TrendingUp />}
        title="Conditions"
        description={plural(sensors.length, 'sensor')}
        actions={
          <RefreshButton
            label="Reload history"
            onClick={reload}
            busy={loading}
          />
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        {metrics.length > 1 && (
          <SegmentedControl
            aria-label="Metric"
            size="sm"
            value={metric}
            onValueChange={setMetric}
            options={metrics.map((m) => {
              const { icon: Icon, short } = METRIC_META[m];
              return {
                value: m,
                icon: <Icon />,
                label: <span className="max-sm:sr-only">{short}</span>,
              };
            })}
          />
        )}
        <SegmentedControl
          aria-label="History range"
          size="sm"
          value={range}
          onValueChange={setRange}
          options={RANGES}
        />
        {hidden.size > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setHidden(new Set())}
          >
            Show all sensors
          </Button>
        )}
      </div>
      <Summary view={view} metric={metric} />
      <ConditionsChart
        view={view}
        metric={metric}
        range={range}
        hidden={hidden}
        loading={loading}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {view.series.map((s) => (
          <SensorTile
            key={s.sensor.id}
            series={s}
            metric={metric}
            shown={!hidden.has(s.sensor.id)}
            onToggle={() => toggle(s.sensor.id)}
            onEdit={() => onEdit(s.sensor)}
          />
        ))}
      </div>
    </Card>
  );
}

/** Average plus the lowest and highest current readings. */
function Summary({ view, metric }: { view: ConditionsView; metric: Metric }) {
  const s = view.summary;
  // A single sensor's tile already says it all.
  if (!s || view.series.length < 2) return null;
  // Name the room when the extremes are in different rooms, else the sensor.
  const where = (x: Series) =>
    roomOf(s.low.sensor) !== roomOf(s.high.sensor)
      ? roomOf(x.sensor)
      : deviceLabel(x.sensor);
  const temp = metric === 'temp';
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatTile
        label="Average"
        value={formatMetric(metric, s.avg)}
        sub={plural(view.series.length, 'sensor')}
      />
      {s.low !== s.high && (
        <>
          <StatTile
            icon={<ArrowDown />}
            label={temp ? 'Coldest' : 'Lowest'}
            value={formatMetric(metric, s.low.last)}
            sub={where(s.low)}
            tone={metricTone(metric, s.low.last)}
          />
          <StatTile
            icon={<ArrowUp />}
            label={temp ? 'Warmest' : 'Highest'}
            value={formatMetric(metric, s.high.last)}
            sub={where(s.high)}
            tone={metricTone(metric, s.high.last)}
          />
        </>
      )}
    </div>
  );
}

function SensorTile({
  series: s,
  metric,
  shown,
  onToggle,
  onEdit,
}: {
  series: Series;
  metric: Metric;
  shown: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const name = deviceLabel(s.sensor);
  const tone = metricTone(metric, s.last);
  return (
    <Card className={cn('space-y-2', !shown && 'opacity-60')}>
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-1.5 size-2 shrink-0 rounded-full"
          style={{ background: s.color }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {roomOf(s.sensor)}
          </p>
        </div>
        <IconButton
          icon={shown ? <Eye /> : <EyeOff />}
          label={`Show ${name} on chart`}
          aria-pressed={shown}
          onClick={onToggle}
        />
        <IconButton icon={<Pencil />} label={`Edit ${name}`} onClick={onEdit} />
      </div>
      <div className="flex items-baseline justify-between gap-2 tabular-nums">
        <span className={cn('text-sm font-medium', tone && TONE_TEXT[tone])}>
          {formatMetric(metric, s.last)}
        </span>
        {s.min !== s.max && (
          <span className="text-xs text-muted-foreground">
            {formatMetric(metric, s.min)}–{formatMetric(metric, s.max)}
          </span>
        )}
      </div>
      <Readings device={s.sensor} exclude={metric} />
    </Card>
  );
}
