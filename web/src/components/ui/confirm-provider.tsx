import { useCallback, useRef, useState, type ReactNode } from 'react';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Button } from '@/components/ui/button';
import { BACKDROP_CLASS } from '@/components/ui/dialog';
import { ConfirmContext, type ConfirmOptions } from '@/hooks/useConfirm';

/** Hosts the single alert dialog behind `useConfirm()`. Mount once at the root. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Kept after closing so the text doesn't vanish mid-transition.
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current?.(false);
        resolveRef.current = resolve;
        setOpts(next);
        setOpen(true);
      }),
    [],
  );

  const settle = (ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setOpen(false);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) settle(false);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className={BACKDROP_CLASS} />
          <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border bg-popover p-5 text-popover-foreground outline-none transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0">
            <div className="space-y-1">
              <AlertDialog.Title className="text-base font-medium">
                {opts?.title}
              </AlertDialog.Title>
              {opts?.body && (
                <AlertDialog.Description className="text-sm text-muted-foreground">
                  {opts.body}
                </AlertDialog.Description>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <AlertDialog.Close render={<Button variant="ghost" />}>
                Cancel
              </AlertDialog.Close>
              <Button
                variant={opts?.destructive ? 'destructive' : 'default'}
                onClick={() => settle(true)}
              >
                {opts?.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  );
}
