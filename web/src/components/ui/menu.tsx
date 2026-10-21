import type { ReactElement, ReactNode } from 'react';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { cn } from '@/lib/utils';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
}

/**
 * Dropdown of actions opened by `trigger` (e.g. an `IconButton`). Arrow
 * keys, typeahead and Escape come from base-ui.
 */
export function Menu({
  trigger,
  items,
  align = 'end',
}: {
  trigger: ReactElement;
  items: MenuItem[];
  align?: 'start' | 'end';
}) {
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger render={trigger} />
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner
          sideOffset={4}
          align={align}
          className="z-50 outline-none"
        >
          <MenuPrimitive.Popup className="min-w-40 rounded-lg border bg-popover p-1 text-popover-foreground outline-none transition-opacity duration-100 data-starting-style:opacity-0 data-ending-style:opacity-0">
            {items.map((item) => (
              <MenuPrimitive.Item
                key={item.label}
                onClick={item.onSelect}
                className={cn(
                  'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-muted [&_svg]:size-4 [&_svg]:shrink-0',
                  item.destructive ? 'text-destructive' : 'text-foreground',
                )}
              >
                {item.icon}
                {item.label}
              </MenuPrimitive.Item>
            ))}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}
