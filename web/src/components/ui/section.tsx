import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Page-level section wrapper. Renders a small uppercase label, optional
 * subtitle and toolbar, then children.
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
