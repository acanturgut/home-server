/** Human-readable message from anything thrown. */
export function errorMessage(
  e: unknown,
  fallback = 'Something went wrong',
): string {
  if (e instanceof Error) return e.message || fallback;
  if (typeof e === 'string' && e) return e;
  return fallback;
}

/** `plural(1, 'device')` → "1 device", `plural(3, 'entry', 'entries')` → "3 entries". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Copies text; resolves false when the clipboard is unavailable or denied. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
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

/** Local "HH:MM" (or "HH:MM:SS" with `seconds`) for a timestamp; '' if invalid. */
export function formatTime(
  ts: string | number | Date | undefined,
  { seconds = false }: { seconds?: boolean } = {},
): string {
  if (ts === undefined || ts === '') return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
  });
}

/** 950 → "950", 1234 → "1.2k", 2_500_000 → "2.5M". */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

/** Go duration strings from the server ("1.2s", "340ms", "80µs") → ms. */
export function parseLatency(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  if (s.endsWith('ms')) return n;
  if (s.endsWith('µs') || s.endsWith('us')) return n / 1000;
  if (s.endsWith('s')) return n * 1000;
  return null;
}

/** 340 → "340ms", 1234 → "1.23s"; '—' when there is no reading. */
export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(0)}ms`;
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
