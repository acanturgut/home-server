import { cn } from '@/lib/utils';

export type AppStatus = 'running' | 'failed' | 'stopped' | 'idle' | string;

const COLOR: Record<string, string> = {
  running: 'bg-emerald-500',
  ok: 'bg-emerald-500',
  online: 'bg-emerald-500',
  failed: 'bg-red-500',
  error: 'bg-red-500',
  warn: 'bg-amber-500',
  warning: 'bg-amber-500',
  stopped: 'bg-zinc-500',
  idle: 'bg-zinc-500',
  pending: 'bg-blue-500',
  building: 'bg-blue-500',
};

export interface StatusDotProps {
  status: AppStatus;
  /** Pixel size. Defaults to 6. */
  size?: number;
  /** Pulse animation for active states. */
  pulse?: boolean;
  className?: string;
}

/** Small colored dot indicating a status. Centralized color mapping. */
export function StatusDot({
  status,
  size = 6,
  pulse = false,
  className,
}: StatusDotProps) {
  const color = COLOR[status] ?? 'bg-zinc-500';
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
