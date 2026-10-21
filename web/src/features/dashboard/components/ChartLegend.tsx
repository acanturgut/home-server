import type { ChartConfig } from '@/components/ui/chart';

/** Inline series legend (colour dot + label) for a card header. */
export function ChartLegend({ config }: { config: ChartConfig }) {
  return (
    <ul className="flex gap-3 text-xs text-muted-foreground">
      {Object.entries(config).map(([key, c]) => (
        <li key={key} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: c.color }}
          />
          {c.label}
        </li>
      ))}
    </ul>
  );
}
