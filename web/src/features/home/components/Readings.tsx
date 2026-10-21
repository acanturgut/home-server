import type { HomeDevice } from '@/features/home/api';
import {
  METRICS,
  METRIC_META,
  TONE_TEXT,
  formatMetric,
  metricTone,
  readMetric,
  type Metric,
} from '@/features/home/deviceMeta';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** A device's sensor readings and battery as one meta line, plus an offline badge. */
export function Readings({
  device,
  exclude,
}: {
  device: HomeDevice;
  /** Metric already shown prominently elsewhere. */
  exclude?: Metric;
}) {
  const items = METRICS.flatMap((m) => {
    const v = m === exclude ? null : readMetric(device, m);
    return v == null ? [] : [{ m, v }];
  });
  if (items.length === 0 && device.reachable) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {items.map(({ m, v }) => {
        const meta = METRIC_META[m];
        const tone = metricTone(m, v);
        return (
          <span
            key={m}
            title={meta.label}
            className={cn(
              'flex items-center gap-1 tabular-nums',
              tone && TONE_TEXT[tone],
            )}
          >
            <meta.icon
              aria-hidden
              className="size-3.5"
              style={{ color: meta.color }}
            />
            <span className="sr-only">{meta.label}</span>
            {formatMetric(m, v)}
          </span>
        );
      })}
      {!device.reachable && <Badge tone="warning">Offline</Badge>}
    </div>
  );
}
