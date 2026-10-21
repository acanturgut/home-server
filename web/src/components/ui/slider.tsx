import { Slider as SliderPrimitive } from '@base-ui/react/slider';
import { cn } from '@/lib/utils';

/**
 * Single-thumb range control with pointer and keyboard support.
 * `onValueChange` fires while dragging; `onValueCommitted` once on release.
 */
export function Slider({
  value,
  onValueChange,
  onValueCommitted,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  'aria-label': ariaLabel,
  className,
}: {
  value: number;
  onValueChange?: (value: number) => void;
  onValueCommitted?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  'aria-label': string;
  className?: string;
}) {
  return (
    <SliderPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      onValueCommitted={onValueCommitted}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className={cn('w-full data-disabled:opacity-50', className)}
    >
      <SliderPrimitive.Control className="flex h-5 w-full touch-none items-center select-none">
        <SliderPrimitive.Track className="h-1 w-full rounded-full bg-input">
          <SliderPrimitive.Indicator className="rounded-full bg-primary" />
          <SliderPrimitive.Thumb
            aria-label={ariaLabel}
            className="size-4 rounded-full bg-primary outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60"
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}
