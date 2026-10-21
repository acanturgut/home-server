import { useEffect } from 'react';

/**
 * Listens for the global `nav:goto` CustomEvent (fired by `gotoPage`) and
 * re-dispatches its payload to the destination page's own listener
 * (`settings:set-tab`). The URL itself is pushed by
 * `gotoPage`.
 */
export function useNavGoto() {
  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { page?: string; payload?: unknown }
        | undefined;
      if (!detail?.page) return;
      if (detail.page === 'settings' && detail.payload) {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('settings:set-tab', { detail: detail.payload }),
          );
        }, 50);
      }
    };
    window.addEventListener('nav:goto', onNav as EventListener);
    return () => window.removeEventListener('nav:goto', onNav as EventListener);
  }, []);
}
