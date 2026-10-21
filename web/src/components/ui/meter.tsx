import { Meter as MeterPrimitive } from '@base-ui/react/meter';
import { cn } from '@/lib/utils';

/** Thin usage bar (CPU, memory, VRAM…). `label` names it for screen readers. */
export function Meter({
  value,
  max = 100,
  label,
  className,
}: {
  value: number;
  max?: number;
  label: string;
  className?: string;
}) {
  return (
    <MeterPrimitive.Root
      value={Math.min(max, Math.max(0, value))}
      max={max}
      aria-label={label}
      className={cn('w-full', className)}
    >
      <MeterPrimitive.Track className="block h-1 overflow-hidden rounded-full bg-muted">
        <MeterPrimitive.Indicator className="block h-full rounded-full bg-foreground/60 transition-[width]" />
      </MeterPrimitive.Track>
    </MeterPrimitive.Root>
  );
}
