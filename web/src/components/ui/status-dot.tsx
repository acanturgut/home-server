import { cn } from '@/lib/utils';

type Status = 'online' | 'offline' | 'warning' | 'error';

const TONE: Record<Status, string> = {
  online: 'bg-success',
  offline: 'bg-muted-foreground/50',
  warning: 'bg-warning',
  error: 'bg-destructive',
};

/**
 * Small state dot. Announced as an image named after the status; pair it
 * with a visible label when the state matters (colour alone is not enough).
 * Size defaults to 6px; override with a `size-*` class.
 */
export function StatusDot({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={status}
      className={cn(
        'inline-block size-1.5 shrink-0 rounded-full',
        TONE[status],
        className,
      )}
    />
  );
}
