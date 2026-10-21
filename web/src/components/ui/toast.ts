import { Toast } from '@base-ui/react/toast';

/** Shared manager behind `toast()`; rendered by `<Toaster />` (main.tsx). */
export const toastManager = Toast.createToastManager();

/**
 * Shows a transient notice in the corner. Errors are announced
 * assertively and stay a little longer.
 */
export function toast(
  title: string,
  {
    tone,
    description,
  }: { tone?: 'success' | 'error'; description?: string } = {},
): void {
  toastManager.add({
    title,
    description,
    type: tone,
    priority: tone === 'error' ? 'high' : 'low',
    timeout: tone === 'error' ? 8000 : 4000,
  });
}
