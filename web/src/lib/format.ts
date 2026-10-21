/**
 * Cross-panel handoff: any panel can call `gotoPage` to navigate. The URL
 * updates (so back/forward & deep-links work) and a `nav:goto` event is
 * still fired for backwards compatibility (e.g. legacy payload listeners).
 *
 * Recognised payload keys map to URL parts:
 *   { tab: 'router' }   →  /settings/router
 *   { room: 'Kitchen' } →  /home/Kitchen
 *   { prompt: 'hi' }    →  ?prompt=hi
 */
import { pushRoute } from '@/app/routing';

export function gotoPage(page: string, payload?: unknown): void {
  let sub: string | undefined;
  const query: Record<string, string | undefined> = {};
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (typeof p.tab === 'string') sub = p.tab;
    else if (typeof p.room === 'string') sub = p.room;
    if (typeof p.prompt === 'string') query.prompt = p.prompt;
  }
  pushRoute(page, sub, query);
  // Back-compat: still emit the legacy event so existing listeners
  // (chat:prefill-prompt, settings:set-tab) continue to fire.
  window.dispatchEvent(
    new CustomEvent('nav:goto', { detail: { page, payload } }),
  );
}

export function copyToClipboard(text: string): void {
  try {
    navigator.clipboard?.writeText(text);
  } catch {
    /* ignore */
  }
}

/** Compact "now / Nm / Nh / Nd / date" relative time. */
export function relTime(ts: number | undefined): string {
  if (!ts) return '';
  const d = Date.now() - ts;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return Math.floor(d / 60_000) + 'm';
  if (d < 86_400_000) return Math.floor(d / 3_600_000) + 'h';
  if (d < 30 * 86_400_000) return Math.floor(d / 86_400_000) + 'd';
  return new Date(ts).toLocaleDateString();
}

/** "Nd Nh Nm" / "Nh Nm" / "Nm" uptime from seconds. */
export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
