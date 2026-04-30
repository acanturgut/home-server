import * as React from 'react';
import { Input as InputPrimitive } from '@base-ui/react/input';

import { cn } from '@/lib/utils';

type InputSize = 'default' | 'sm' | 'xs';

const sizeClasses: Record<InputSize, string> = {
  default: 'h-8 px-2.5 text-base md:text-sm',
  sm: 'h-7 px-2.5 text-[0.8rem] rounded-[min(var(--radius-md),12px)]',
  xs: 'h-6 px-2 text-xs rounded-[min(var(--radius-md),10px)]',
};

function Input({
  className,
  type,
  inputSize = 'default',
  ...props
}: React.ComponentProps<'input'> & { inputSize?: InputSize }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'w-full min-w-0 rounded-lg border border-input bg-transparent py-1 transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        sizeClasses[inputSize],
        className,
      )}
      {...props}
    />
  );
}

export { Input };
