import { createContext, useContext, type ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  /** Label of the confirming button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Styles the confirming button as destructive. */
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Returns `confirm(opts)`, which opens the shared alert dialog and resolves
 * true when the user confirms. Needs `<ConfirmProvider>` (mounted in main.tsx).
 */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm)
    throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return confirm;
}
