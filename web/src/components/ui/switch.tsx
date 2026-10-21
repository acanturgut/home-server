import type { ComponentProps } from 'react';
import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { cn } from '@/lib/utils';

/** Flat on/off switch. Controlled via `checked` + `onCheckedChange`. */
function Switch({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring/60',
        'data-disabled:cursor-not-allowed data-disabled:opacity-50',
        'data-checked:bg-primary data-unchecked:bg-input',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="thumb"
        className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-muted-foreground transition-transform data-checked:translate-x-[18px] data-checked:bg-primary-foreground"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
