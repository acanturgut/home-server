import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PanelProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'title'
> {
  /** Optional header title. */
  title?: ReactNode;
  /** Optional small subtitle below the title. */
  description?: ReactNode;
  /** Optional toolbar rendered at the right of the header. */
  toolbar?: ReactNode;
  /** Padding inside the body. Defaults to 'md'. */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const PADDING: Record<NonNullable<PanelProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5 sm:p-6',
};

/**
 * The single canonical card surface used by every page in the app.
 *
 *   <Panel title="Devices" toolbar={<Refresh />}>
 *     ...rows...
 *   </Panel>
 *
 * - rounded-xl (matches the rest of the design language)
 * - subtle border + tinted card background, no opacity acrobatics
 * - opinionated header (title bold, optional description, right-aligned toolbar)
 * - one source of truth for spacing
 *
 * Avoid hand-rolled `<div className="rounded-lg border ...">` blocks. Use this.
 */
export function Panel({
  title,
  description,
  toolbar,
  padding = 'md',
  className,
  children,
  ...rest
}: PanelProps) {
  const showHeader = Boolean(title || toolbar || description);
  return (
    <div
      className={cn(
        'rounded-xl border border-border/40 bg-card/40 overflow-hidden',
        className,
      )}
      {...rest}>
      {showHeader && (
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border/30">
          <div className="min-w-0">
            {title && (
              <div className="text-sm font-semibold text-foreground truncate">
                {title}
              </div>
            )}
            {description && (
              <div className="text-xs text-muted-foreground/80 mt-0.5">
                {description}
              </div>
            )}
          </div>
          {toolbar && (
            <div className="flex items-center gap-1.5 shrink-0">{toolbar}</div>
          )}
        </div>
      )}
      <div className={PADDING[padding]}>{children}</div>
    </div>
  );
}

/**
 * Page-level section wrapper. Renders a small uppercase label, optional
 * subtitle, then children. Use between Panels to group related cards.
 */
export function Section({
  title,
  description,
  toolbar,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || description || toolbar) && (
        <div className="flex items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            {title && (
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-xs text-muted-foreground/65 mt-0.5">
                {description}
              </p>
            )}
          </div>
          {toolbar && <div className="shrink-0">{toolbar}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Compact KPI/stat tile for the top of pages.
 *
 *   <Stat label="Devices" value="12 / 14" hint="online" tone="good" />
 */
export function Stat({
  label,
  value,
  hint,
  icon,
  tone,
  mono,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'good' | 'warn' | 'bad';
  mono?: boolean;
  className?: string;
}) {
  const valueColor =
    tone === 'good'
      ? 'text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-300'
        : tone === 'bad'
          ? 'text-rose-300'
          : 'text-foreground';
  return (
    <div
      className={cn(
        'rounded-xl border border-border/40 bg-card/40 px-4 py-3 min-w-0',
        className,
      )}>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground/80">
        {icon && <span className="text-muted-foreground/70">{icon}</span>}
        {label}
      </div>
      <div
        className={cn(
          'mt-1.5 text-lg font-semibold truncate',
          mono && 'font-mono text-base',
          valueColor,
        )}
        title={typeof value === 'string' ? value : undefined}>
        {value}
        {hint && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground/70">
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}
