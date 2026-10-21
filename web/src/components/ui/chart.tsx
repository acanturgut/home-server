import * as React from 'react';
import * as RechartsPrimitive from 'recharts';

import { cn } from '@/lib/utils';

const INITIAL_DIMENSION = { width: 320, height: 200 } as const;

/** Series key → label + colour (prefer `var(--chart-n)`, in slot order). */
export type ChartConfig = Record<
  string,
  { label?: React.ReactNode; color?: string }
>;

function ChartContainer({
  id,
  className,
  children,
  config,
  initialDimension = INITIAL_DIMENSION,
  ...props
}: React.ComponentProps<'div'> & {
  config: ChartConfig;
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >['children'];
  initialDimension?: {
    width: number;
    height: number;
  };
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, '')}`;

  return (
    <div
      data-slot="chart"
      data-chart={chartId}
      className={cn(
        "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-curve.recharts-tooltip-cursor]:stroke-muted [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-muted [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-muted [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
        className,
      )}
      {...props}
    >
      <ChartStyle id={chartId} config={config} />
      <RechartsPrimitive.ResponsiveContainer
        initialDimension={initialDimension}
      >
        {children}
      </RechartsPrimitive.ResponsiveContainer>
    </div>
  );
}

/** Exposes each series colour as `--color-<key>` inside the chart. */
function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const vars = Object.entries(config)
    .filter(([, c]) => c.color)
    .map(([key, c]) => `--color-${key}: ${c.color};`)
    .join(' ');
  if (!vars) return null;
  return (
    <style
      dangerouslySetInnerHTML={{ __html: `[data-chart=${id}] { ${vars} }` }}
    />
  );
}

/**
 * Tooltip body for Recharts' `<Tooltip content={<ChartTooltipContent />} />`:
 * a flat popover listing each series (label from `config`, value through
 * `formatValue`). The Tooltip's `labelFormatter` formats the heading.
 */
function ChartTooltipContent({
  active,
  payload,
  label,
  labelFormatter,
  config,
  formatValue = (v) => String(v),
}: Partial<
  Pick<
    RechartsPrimitive.TooltipContentProps,
    'active' | 'payload' | 'label' | 'labelFormatter'
  >
> & {
  config?: ChartConfig;
  formatValue?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-32 rounded-md bg-popover px-2.5 py-1.5 shadow-float text-xs text-popover-foreground">
      {label !== undefined && (
        <div className="mb-1 text-muted-foreground">
          {labelFormatter ? labelFormatter(label, payload) : label}
        </div>
      )}
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.name);
        return (
          <div key={key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: item.color }}
            />
            <span className="text-muted-foreground">
              {config?.[key]?.label ?? item.name}
            </span>
            <span className="ml-auto pl-3 font-medium tabular-nums">
              {formatValue(Number(item.value))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Tiny decorative area chart for stat tiles. Sits beside the number it
 * illustrates, so it is hidden from assistive tech.
 */
function Sparkline({
  data,
  color = 'var(--chart-1)',
  max,
  className,
}: {
  data: number[];
  color?: string;
  /** Fixed y-axis maximum (e.g. 100 for percentages); auto otherwise. */
  max?: number;
  className?: string;
}) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <div aria-hidden className={cn('h-10 w-full', className)}>
      <RechartsPrimitive.ResponsiveContainer
        initialDimension={{ width: 120, height: 40 }}
      >
        <RechartsPrimitive.AreaChart
          data={points}
          margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
        >
          <RechartsPrimitive.YAxis hide domain={[0, max ?? 'auto']} />
          <RechartsPrimitive.Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={color}
            fillOpacity={0.12}
            dot={false}
            isAnimationActive={false}
          />
        </RechartsPrimitive.AreaChart>
      </RechartsPrimitive.ResponsiveContainer>
    </div>
  );
}

export { ChartContainer, ChartTooltipContent, Sparkline };
