import type { ComponentProps } from 'react';
import { CONTROL_CLASS } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Multi-line text input styled like `Input`. */
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(CONTROL_CLASS, 'min-h-16 px-2.5 py-2', className)}
      {...props}
    />
  );
}
