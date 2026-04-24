/**
 * Resolves the backend API base URL.
 *
 * Honors `VITE_API_URL` at build time; otherwise falls back to the page's
 * host on port 8080.
 */
export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  `${window.location.protocol}//${window.location.hostname}:8080`;
