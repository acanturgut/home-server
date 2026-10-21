import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TONE = {
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
} as const;

/**
 * Label over value (plus optional sub-line and chart). Unboxed so it sits
 * inside cards; wrap it in `<Card>` for a standalone tile.
 */
export function StatTile({
  label,
  value,
  sub,
  icon,
  mono = false,
  tone,
  chart,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  mono?: boolean;
  tone?: keyof typeof TONE;
  chart?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          'mt-0.5 truncate text-sm font-medium tabular-nums',
          mono && 'font-mono',
          tone ? TONE[tone] : 'text-foreground',
        )}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </div>
      {sub && (
        <div className="truncate text-xs text-muted-foreground">{sub}</div>
      )}
      {chart && <div className="mt-2">{chart}</div>}
    </div>
  );
}
