import { useEffect } from 'react';

/**
 * Listens for a global `nav:goto` CustomEvent and invokes the supplied
 * navigator. The event detail carries the destination page id and an optional
 * payload that the destination page can pick up via its own listener.
 *
 * Currently wired by ChatPanel → "Send to Apps" handoff.
 */
export function useNavGoto(onNavigate: (page: string) => void) {
  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { page?: string; payload?: unknown }
        | undefined;
      if (!detail?.page) return;
      onNavigate(detail.page);
      if (detail.page === 'apps' && detail.payload) {
        // Re-dispatch so AppsPanel (already mounted) can pick it up
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('apps:prefill-prompt', { detail: detail.payload }),
          );
        }, 50);
      }
    };
    window.addEventListener('nav:goto', onNav as EventListener);
    return () => window.removeEventListener('nav:goto', onNav as EventListener);
  }, [onNavigate]);
}
