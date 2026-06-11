import * as React from 'react';
import { Switch as SwitchPrimitive } from '@base-ui/react/switch';

import { cn } from '@/lib/utils';

/** shadcn-styled Switch built on top of @base-ui/react.
 * - controlled: pass `checked` + `onCheckedChange`
 * - sized via the `size` prop ("sm" | "default") */
function Switch({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: 'sm' | 'default';
}) {
  const dims =
    size === 'sm'
      ? 'h-4 w-7 [&>[data-slot=thumb]]:size-3 [&>[data-slot=thumb]]:data-[checked]:translate-x-3'
      : 'h-5 w-9 [&>[data-slot=thumb]]:size-4 [&>[data-slot=thumb]]:data-[checked]:translate-x-4';
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none',
        'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[checked]:bg-emerald-500/70 data-[unchecked]:bg-input/60',
        dims,
        className,
      )}
      {...props}>
      <SwitchPrimitive.Thumb
        data-slot="thumb"
        className={cn(
          'pointer-events-none block rounded-full bg-background shadow-md ring-0 transition-transform',
          'data-[unchecked]:translate-x-0.5',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
