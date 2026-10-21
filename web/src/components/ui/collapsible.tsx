import type { ReactNode } from 'react';
import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';
import { ChevronRight } from 'lucide-react';

/** Disclosure: a full-width trigger row with a chevron that reveals `children`. */
export function Collapsible({
  trigger,
  defaultOpen = false,
  className,
  children,
}: {
  trigger: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <CollapsiblePrimitive.Root defaultOpen={defaultOpen} className={className}>
      <CollapsiblePrimitive.Trigger className="group flex w-full items-center gap-2 rounded-md py-1.5 text-left text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-90"
        />
        <span className="min-w-0 flex-1">{trigger}</span>
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Panel className="pt-2">
        {children}
      </CollapsiblePrimitive.Panel>
    </CollapsiblePrimitive.Root>
  );
}
