import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Centered "nothing here yet" block with an optional next step. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  dashed = false,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Dashed outline, for empty lists that stand on their own. */
  dashed?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 px-4 py-8 text-center',
        dashed && 'rounded-lg border border-dashed',
        className,
      )}
    >
      {icon && (
        <span className="mb-1 text-muted-foreground [&_svg]:size-5">
          {icon}
        </span>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
