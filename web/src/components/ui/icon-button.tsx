import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SIZE = { sm: 'icon-sm', default: 'icon', lg: 'icon-lg' } as const;

/**
 * Icon-only ghost button. `label` is required: it becomes the accessible
 * name and the hover tooltip.
 */
export function IconButton({
  icon,
  label,
  active = false,
  size = 'sm',
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children' | 'size' | 'variant'> & {
  icon: ReactNode;
  label: string;
  /** Pressed / current styling (toggle on, current page). */
  active?: boolean;
  size?: keyof typeof SIZE;
}) {
  return (
    <Button
      variant="ghost"
      size={SIZE[size]}
      aria-label={label}
      title={label}
      className={cn(
        'text-muted-foreground',
        active && 'bg-muted text-foreground',
        className,
      )}
      {...props}
    >
      {icon}
    </Button>
  );
}
