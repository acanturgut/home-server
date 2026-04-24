/**
 * Cross-panel handoff: any panel can dispatch a `nav:goto` event with an
 * arbitrary payload, and the top-level App will switch pages and forward the
 * payload to the destination panel.
 */
export function gotoPage(page: string, payload?: unknown): void {
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

/** "HH:MM:SS" from an ISO timestamp string. */
export function fmtTime(ts?: string): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}
