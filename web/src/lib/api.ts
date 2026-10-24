/** Event name dispatched on `window` whenever the API responds 401. */
export const AUTH_UNAUTHORIZED_EVENT = 'auth:unauthorized';

/**
 * Thin same-origin `fetch` wrapper (Vite proxies /api in dev) that sends the
 * session cookie and sets a JSON `Content-Type` when a body is provided. Returns the raw
 * `Response` so streaming consumers can read the body. Does NOT throw on
 * non-2xx, but every 401 still fires `AUTH_UNAUTHORIZED_EVENT`.
 */
export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init?.body && !(init.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...((init?.headers as Record<string, string>) || {}),
  };
  const r = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (r.status === 401) {
    window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
  }
  return r;
}

/**
 * Same as `apiFetch` but parses JSON (`undefined` for an empty body, e.g.
 * 204). Throws on non-2xx with the server's `{ error }` message, its
 * plain-text body, or the status.
 */
export async function apiJson<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const r = await apiFetch(path, init);
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    let msg = body.trim() || `HTTP ${r.status}`;
    try {
      const data = JSON.parse(body);
      if (data?.error) msg = data.error;
    } catch {
      /* plain-text error body */
    }
    throw new Error(msg);
  }
  const text = await r.text();
  return (text ? JSON.parse(text) : undefined) as T;
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
