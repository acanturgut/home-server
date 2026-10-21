import type { ComponentProps } from 'react';
import { CONTROL_CLASS } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Native `<select>` sized and styled like `Input`. */
export function Select({
  className,
  selectSize = 'default',
  ...props
}: ComponentProps<'select'> & { selectSize?: 'default' | 'sm' }) {
  return (
    <select
      data-slot="select"
      className={cn(
        CONTROL_CLASS,
        'bg-background',
        selectSize === 'sm' ? 'h-7 px-1.5' : 'h-8 px-2',
        className,
      )}
      {...props}
    />
  );
}
