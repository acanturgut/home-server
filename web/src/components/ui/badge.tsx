import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TONE = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  info: 'bg-info/10 text-info',
} as const;

/** Small flat label for a state or category. */
export function Badge({
  tone = 'neutral',
  mono = false,
  className,
  children,
}: {
  tone?: keyof typeof TONE;
  mono?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3',
        mono && 'font-mono',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
