import type { ReactNode } from 'react';
import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { cn } from '@/lib/utils';

/**
 * Single-choice button group (filters, modes). Arrow keys move between
 * options; one option is always selected.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  size = 'default',
  'aria-label': ariaLabel,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  size?: 'default' | 'sm';
  'aria-label': string;
  className?: string;
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(next) => {
        if (next[0]) onValueChange(next[0] as T);
      }}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border p-0.5',
        className,
      )}
    >
      {options.map((o) => (
        <Toggle
          key={o.value}
          value={o.value}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 data-pressed:bg-muted data-pressed:text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0',
            size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-2.5 text-sm',
          )}
        >
          {o.icon}
          {o.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
