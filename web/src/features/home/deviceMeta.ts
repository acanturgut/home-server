import {
  Activity,
  Battery,
  Blinds,
  Droplets,
  Lightbulb,
  Plug,
  Power,
  Radio,
  Speaker,
  Thermometer,
  Tv,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import type {
  HomeDevice,
  HomeDeviceType,
  SensorSample,
} from '@/features/home/api';

/** dataTransfer type used when dragging a device card onto a room. */
export const DEVICE_MIME = 'text/x-device-id';

export const UNASSIGNED_ROOM = 'Unassigned';

/** Room name for grouping; blank rooms fall into "Unassigned". */
export function roomOf(d: HomeDevice): string {
  return d.room?.trim() || UNASSIGNED_ROOM;
}

/** Display name: the user's override wins over the bridge name. */
export function deviceLabel(d: HomeDevice): string {
  return d.display_name?.trim() || d.name?.trim() || d.local_id || 'Unnamed';
}

export const TYPE_META: Record<
  HomeDeviceType,
  { icon: LucideIcon; name: string; group: string }
> = {
  light: { icon: Lightbulb, name: 'Light', group: 'Lights' },
  plug: { icon: Plug, name: 'Plug', group: 'Plugs' },
  blind: { icon: Blinds, name: 'Blind', group: 'Blinds' },
  sensor: { icon: Activity, name: 'Sensor', group: 'Sensors' },
  tv: { icon: Tv, name: 'TV', group: 'TVs' },
  speaker: { icon: Speaker, name: 'Speaker', group: 'Speakers' },
  remote: { icon: Radio, name: 'Remote', group: 'Remotes' },
  other: { icon: Power, name: 'Other', group: 'Other' },
};

/** Order of device groups inside a room. Sensors render in ConditionsCard. */
export const TYPE_ORDER: HomeDeviceType[] = [
  'light',
  'blind',
  'plug',
  'tv',
  'speaker',
  'remote',
  'other',
];

export type Metric = 'temp' | 'humidity' | 'pm25' | 'voc' | 'battery';

export const METRICS: Metric[] = ['temp', 'humidity', 'pm25', 'voc', 'battery'];

export const METRIC_META: Record<
  Metric,
  {
    label: string;
    short: string;
    icon: LucideIcon;
    color: string;
    unit: string;
    fixed: number;
    domain: [number | 'auto', number | 'auto'];
  }
> = {
  temp: {
    label: 'Temperature',
    short: 'Temp',
    icon: Thermometer,
    color: 'var(--chart-2)',
    unit: '°',
    fixed: 1,
    domain: ['auto', 'auto'],
  },
  humidity: {
    label: 'Humidity',
    short: 'Humidity',
    icon: Droplets,
    color: 'var(--chart-1)',
    unit: '%',
    fixed: 0,
    domain: [0, 100],
  },
  pm25: {
    label: 'PM2.5',
    short: 'PM2.5',
    icon: Wind,
    color: 'var(--chart-4)',
    unit: '',
    fixed: 0,
    domain: [0, 'auto'],
  },
  voc: {
    label: 'VOC index',
    short: 'VOC',
    icon: Activity,
    color: 'var(--chart-5)',
    unit: '',
    fixed: 0,
    domain: [0, 'auto'],
  },
  battery: {
    label: 'Battery',
    short: 'Battery',
    icon: Battery,
    color: 'var(--chart-3)',
    unit: '%',
    fixed: 0,
    domain: [0, 100],
  },
};

/** A finite reading from a device or history sample, else null. */
export function readMetric(
  src: HomeDevice | SensorSample,
  m: Metric,
): number | null {
  const v = src[m];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function formatMetric(
  m: Metric,
  v: number,
  digits = METRIC_META[m].fixed,
): string {
  return `${v.toFixed(digits)}${METRIC_META[m].unit}`;
}

type Tone = 'warning' | 'destructive';

export const TONE_TEXT: Record<Tone, string> = {
  warning: 'text-warning',
  destructive: 'text-destructive',
};

/**
 * Flags readings that need attention: PM2.5 above the WHO interim target
 * (25 µg/m³), an elevated SGP41 VOC index (≥200) and low batteries.
 */
export function metricTone(m: Metric, v: number): Tone | undefined {
  if (m === 'pm25')
    return v > 50 ? 'destructive' : v > 25 ? 'warning' : undefined;
  if (m === 'voc')
    return v >= 300 ? 'destructive' : v >= 200 ? 'warning' : undefined;
  if (m === 'battery' && v < 20) return 'destructive';
  return undefined;
}
