import { Toast } from '@base-ui/react/toast';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { toastManager } from '@/components/ui/toast';

/** Renders `toast()` notices. Mount once at the root. */
export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager}>
      <Toast.Portal>
        <Toast.Viewport className="fixed right-4 bottom-4 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col-reverse gap-2 outline-none sm:bottom-12">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((t) => (
    <Toast.Root
      key={t.id}
      toast={t}
      className="flex items-start gap-2.5 rounded-lg bg-popover p-3 shadow-float text-sm text-popover-foreground transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0 [&_svg]:size-4 [&_svg]:shrink-0"
    >
      {t.type === 'error' && (
        <CircleAlert aria-hidden className="mt-0.5 text-destructive" />
      )}
      {t.type === 'success' && (
        <CircleCheck aria-hidden className="mt-0.5 text-success" />
      )}
      <div className="min-w-0 flex-1 break-words">
        <Toast.Title className="font-medium" />
        {t.description && (
          <Toast.Description className="mt-0.5 text-muted-foreground" />
        )}
      </div>
      <Toast.Close
        aria-label="Dismiss"
        className="-m-1 rounded-md p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <X />
      </Toast.Close>
    </Toast.Root>
  ));
}
