import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: ReactNode;
  title?: ReactNode;
  message?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Centered empty/placeholder state for lists and panels. */
export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground',
        className,
      )}>
      {icon && <div className="opacity-60">{icon}</div>}
      {title && (
        <div className="text-sm font-medium text-foreground/80">{title}</div>
      )}
      {message && <div className="text-[11px] max-w-sm">{message}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
