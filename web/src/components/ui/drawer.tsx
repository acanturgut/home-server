import type { ReactNode } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { BACKDROP_CLASS } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils';

/**
 * Edge sheet for mobile menus and lists: slides up from the bottom or in
 * from the left. Modal (focus trap, Escape, backdrop click close).
 * ponytail: built on Dialog; base-ui's Drawer adds swipe-to-dismiss if
 * that's ever wanted.
 */
export function Drawer({
  open,
  onOpenChange,
  side = 'bottom',
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: 'bottom' | 'left';
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={BACKDROP_CLASS} />
        <DialogPrimitive.Popup
          className={cn(
            'fixed z-50 flex flex-col bg-popover text-popover-foreground shadow-float outline-none transition-transform duration-200',
            side === 'bottom'
              ? 'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl pb-[env(safe-area-inset-bottom)] data-starting-style:translate-y-full data-ending-style:translate-y-full'
              : 'inset-y-0 left-0 w-[min(20rem,85vw)] data-starting-style:-translate-x-full data-ending-style:-translate-x-full',
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2">
            <DialogPrimitive.Title className="truncate text-sm font-medium">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              render={
                <IconButton icon={<X />} label="Close" className="-mr-1" />
              }
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {children}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
