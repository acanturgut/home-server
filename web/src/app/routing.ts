/**
 * Tiny URL-based router built on the History API.
 *
 * Routes are flat: `/<page>` and `/<page>/<sub>`. Optional payloads ride in
 * the query string. Examples:
 *
 *   /                           → dashboard
 *   /chat                       → chat
 *   /chat?prompt=hi             → chat with prefilled prompt
 *   /settings                   → settings (default tab)
 *   /settings/router            → settings with router tab open
 *   /home                       → smart home (all rooms)
 *   /home/Living%20Room         → smart home filtered to that room
 *
 * `useRoute()` re-renders on popstate. `pushRoute()` updates the URL and
 * fires popstate so subscribers re-read.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

export type RouteState = {
  page: string;
  sub?: string;
  query: URLSearchParams;
};

const DEFAULT_PAGE = 'dashboard';

function readRoute(): RouteState {
  const segs = window.location.pathname.split('/').filter(Boolean);
  const page = segs[0] || DEFAULT_PAGE;
  const sub = segs[1] ? safeDecode(segs[1]) : undefined;
  const query = new URLSearchParams(window.location.search);
  return { page, sub, query };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function buildPath(
  page: string,
  sub?: string,
  query?: Record<string, string | undefined>,
): string {
  let path = page === DEFAULT_PAGE ? '/' : `/${page}`;
  if (sub) path += `/${encodeURIComponent(sub)}`;
  if (query) {
    const sp = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== '') sp.set(k, v);
    });
    const qs = sp.toString();
    if (qs) path += `?${qs}`;
  }
  return path;
}

/** Push a new route. Triggers a popstate so `useRoute` subscribers update. */
export function pushRoute(
  page: string,
  sub?: string,
  query?: Record<string, string | undefined>,
): void {
  const path = buildPath(page, sub, query);
  if (path === window.location.pathname + window.location.search) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function subscribe(cb: () => void) {
  window.addEventListener('popstate', cb);
  return () => window.removeEventListener('popstate', cb);
}

// Cache snapshot so getSnapshot is stable between popstate events.
let snapshot: RouteState = readRoute();
let snapshotPath = window.location.pathname + window.location.search;
function getSnapshot(): RouteState {
  const cur = window.location.pathname + window.location.search;
  if (cur !== snapshotPath) {
    snapshot = readRoute();
    snapshotPath = cur;
  }
  return snapshot;
}

export function useRoute(): RouteState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Reactive media-query hook — used for mobile master/detail. */
function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = () => setMatch(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return match;
}

/** True on screens narrower than Tailwind's `lg` breakpoint. */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 1023px)');
}
