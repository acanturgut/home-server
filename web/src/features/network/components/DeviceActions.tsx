import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { IconButton } from '@/components/ui/icon-button';
import { Menu, type MenuItem } from '@/components/ui/menu';
import { cn } from '@/lib/utils';

/**
 * A device's action list: a dropdown menu from `sm` up, a bottom drawer
 * (with the device's name and address) on phones.
 */
export function DeviceActions({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const label = `Actions for ${title}`;
  return (
    <>
      <Menu
        items={items}
        trigger={
          <IconButton
            icon={<MoreHorizontal />}
            label={label}
            className="hidden sm:inline-flex"
          />
        }
      />
      <IconButton
        icon={<MoreHorizontal />}
        label={label}
        size="default"
        className="sm:hidden"
        onClick={() => setOpen(true)}
      />
      <Drawer open={open} onOpenChange={setOpen} title={title}>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {description}
        </p>
        <div className="mt-3 -mx-2 flex flex-col">
          {items.map((item) => (
            <Button
              key={item.label}
              variant="ghost"
              className={cn(
                'h-11 justify-start px-2',
                item.destructive && 'text-destructive',
              )}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon}
              {item.label}
            </Button>
          ))}
        </div>
      </Drawer>
    </>
  );
}
