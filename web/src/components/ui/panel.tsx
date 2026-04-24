import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Optional header title. Hidden when omitted. */
  title?: ReactNode;
  /** Optional toolbar rendered at the right of the header. */
  toolbar?: ReactNode;
  /** Padding. Defaults to 'md' (p-3). Use 'none' for full-bleed children. */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const PADDING: Record<NonNullable<PanelProps['padding']>, string> = {
  none: '',
  sm: 'p-2',
  md: 'p-3',
  lg: 'p-4',
};

/**
 * Standard rounded panel container with optional header. Replaces the many
 * inline `rounded-lg border border-border/30 p-3 space-y-2` divs across panels.
 *
 * Distinct from the shadcn `Card` (heavier "page card" style) — this one is
 * flat, dense, and matches the dashboard/settings aesthetic.
 */
export function Panel({
  title,
  toolbar,
  padding = 'md',
  className,
  children,
  ...rest
}: PanelProps) {
  const showHeader = Boolean(title || toolbar);
  return (
    <div
      className={cn(
        'rounded-lg border border-border/30 bg-background/40',
        className,
      )}
      {...rest}>
      {showHeader && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/20">
          {title ? (
            <span className="text-[11px] font-medium text-muted-foreground">
              {title}
            </span>
          ) : (
            <span />
          )}
          {toolbar && (
            <div className="flex items-center gap-1">{toolbar}</div>
          )}
        </div>
      )}
      <div className={cn(PADDING[padding], showHeader && 'space-y-2')}>
        {children}
      </div>
    </div>
  );
}
