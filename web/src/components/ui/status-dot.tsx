import { cn } from '@/lib/utils';

export type DotStatus = 'running' | 'failed' | 'stopped' | 'idle' | string;

// Monochrome: state reads from brightness and fill, not hue.
const LIVE = 'bg-foreground';
const BUSY = 'bg-muted-foreground';
const OFF = 'bg-muted-foreground/40';
const FAIL = 'bg-transparent ring-1 ring-inset ring-foreground';

const STYLE: Record<string, string> = {
  running: LIVE,
  ok: LIVE,
  online: LIVE,
  failed: FAIL,
  error: FAIL,
  warn: BUSY,
  warning: BUSY,
  pending: BUSY,
  building: BUSY,
  stopped: OFF,
  idle: OFF,
};

export interface StatusDotProps {
  status: DotStatus;
  /** Pixel size. Defaults to 6. */
  size?: number;
  /** Pulse animation for active states. */
  pulse?: boolean;
  className?: string;
}

/** Small dot indicating a status. Centralized style mapping. */
export function StatusDot({
  status,
  size = 6,
  pulse = false,
  className,
}: StatusDotProps) {
  const color = STYLE[status] ?? OFF;
  return (
    <span
      className={cn(
        'inline-block rounded-full align-middle',
        color,
        pulse && 'animate-pulse',
        className,
      )}
      style={{ width: size, height: size }}
      aria-label={status}
    />
  );
}
