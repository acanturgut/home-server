/**
 * Resolves the backend API base URL.
 *
 * Honors `VITE_API_URL` at build time; otherwise falls back to the page's
 * host on port 8080.
 */
export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  `${window.location.protocol}//${window.location.hostname}:8080`;

/** Build a full URL from an API path (e.g. `/api/foo`). */
export const apiUrl = (path: string): string => `${API_BASE}${path}`;

/**
 * Thin `fetch` wrapper that prepends `API_BASE` and sets a JSON
 * `Content-Type` when a body is provided. Returns the raw `Response`
 * so streaming consumers can read the body. Does NOT throw on non-2xx.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init?.body && !(init.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...((init?.headers as Record<string, string>) || {}),
  };
  return fetch(apiUrl(path), { ...init, headers });
}

/** Same as `apiFetch` but parses JSON. Throws on non-2xx. */
export async function apiJson<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const r = await apiFetch(path, init);
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const data = await r.json();
      if (data?.error) msg = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

/** Same as `apiJson` but never throws — returns `null` on any failure. */
export async function apiJsonSafe<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    return await apiJson<T>(path, init);
  } catch {
    return null;
  }
}
