import type { ComponentProps } from 'react';
import { Input as InputPrimitive } from '@base-ui/react/input';
import { cn } from '@/lib/utils';

/**
 * Shared look of text-like controls (Input, Select, Textarea). 16px on
 * phones so iOS doesn't zoom on focus, 14px from `sm` up.
 */
export const CONTROL_CLASS =
  'w-full min-w-0 rounded-md border border-input bg-transparent text-base sm:text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive';

function Input({
  className,
  inputSize = 'default',
  ...props
}: ComponentProps<'input'> & { inputSize?: 'default' | 'sm' }) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(
        CONTROL_CLASS,
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        inputSize === 'sm' ? 'h-7 px-2' : 'h-8 px-2.5',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
