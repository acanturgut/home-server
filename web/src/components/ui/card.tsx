import type { ReactNode } from 'react';
import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cn } from '@/lib/utils';

/**
 * Flat surface: border + card background, 16px padding, no shadow. Use
 * `render={<button type="button" />}` (with `interactive`) for a clickable
 * card, and `p-0` for edge-to-edge lists.
 */
export function Card({
  interactive = false,
  render,
  className,
  ...props
}: useRender.ComponentProps<'div'> & { interactive?: boolean }) {
  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      {
        className: cn(
          'rounded-lg border bg-card p-4 text-card-foreground',
          interactive &&
            'w-full text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/60',
          className,
        ),
      },
      props,
    ),
  });
}

/** Title row of a card: optional icon, title, description and right-hand actions. */
export function CardHeader({
  title,
  description,
  icon,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm font-medium text-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
          {icon}
          <span className="truncate">{title}</span>
        </h3>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      )}
    </div>
  );
}
