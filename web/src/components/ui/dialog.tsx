import type { ReactNode } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils';

/** Dimmed page behind modal surfaces (Dialog, Drawer, confirm). */
export const BACKDROP_CLASS =
  'fixed inset-0 z-50 bg-black/60 transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0';

/**
 * Centered modal with title, optional description, body and footer
 * actions. Focus is trapped; Escape and backdrop clicks close it.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={BACKDROP_CLASS} />
        <DialogPrimitive.Popup
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg border bg-popover p-5 text-popover-foreground outline-none transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <DialogPrimitive.Title className="text-base font-medium">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-sm text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              render={
                <IconButton
                  icon={<X />}
                  label="Close"
                  className="-mt-1 -mr-1"
                />
              }
            />
          </div>
          {children}
          {footer && <div className="flex justify-end gap-2">{footer}</div>}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
