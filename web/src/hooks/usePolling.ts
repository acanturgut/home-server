import { useEffect, useEffectEvent } from 'react';

/**
 * Calls `fn` now and then every `ms`. With `pauseWhenHidden` (the default)
 * the timer stops while the tab is hidden and fires once on return, so
 * background tabs don't poll. The latest `fn` always runs.
 */
export function usePolling(
  fn: () => unknown,
  ms: number,
  { pauseWhenHidden = true }: { pauseWhenHidden?: boolean } = {},
): void {
  const tick = useEffectEvent(fn);
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      tick();
      id = setInterval(() => tick(), ms);
    };
    const stop = () => {
      clearInterval(id);
      id = undefined;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (id === undefined) start();
    };
    if (!pauseWhenHidden || !document.hidden) start();
    if (pauseWhenHidden) {
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ms, pauseWhenHidden]);
}
