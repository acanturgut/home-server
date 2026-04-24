import { cn } from '@/lib/utils';

export interface SpinnerProps {
  /** Pixel size of the spinner. Defaults to 14. */
  size?: number;
  className?: string;
}

/** Tiny circular spinner used in loading states. */
export function Spinner({ size = 14, className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin align-middle',
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}
