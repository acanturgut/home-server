// Tiny client for the home-server. Auth is username/password → session
// token (returned by /api/auth/login), then sent as `Authorization: Bearer`
// on every subsequent request.

export type AskResponse = {
  reply: string;
  model?: string;
  node?: string;
  handler?: 'home' | 'llm';
};

export type LoginResponse = {
  token: string;
  user: { id: string; username: string; role: string };
};

export type AskOptions = {
  baseUrl: string;
  session: string;
  prompt: string;
  signal?: AbortSignal;
};

export type LoginOptions = {
  baseUrl: string;
  username: string;
  password: string;
  signal?: AbortSignal;
};

function trimBase(u: string): string {
  return u.replace(/\/+$/, '');
}

export async function login({
  baseUrl,
  username,
  password,
  signal,
}: LoginOptions): Promise<LoginResponse> {
  const url = trimBase(baseUrl) + '/api/auth/login';
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch (err: any) {
    throw new Error(networkErrorMessage(url, err));
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(parseError(text, res.status));
  }
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('Server returned non-JSON response');
  }
  if (!body?.token) {
    throw new Error('Login succeeded but server did not return a session token');
  }
  return body as LoginResponse;
}

export async function ask({
  baseUrl,
  session,
  prompt,
  signal,
}: AskOptions): Promise<AskResponse> {
  const url = trimBase(baseUrl) + '/api/ai/ask';
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session}`,
      },
      body: JSON.stringify({ prompt }),
    });
  } catch (err: any) {
    throw new Error(networkErrorMessage(url, err));
  }
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) {
      throw new SessionExpiredError(parseError(text, res.status));
    }
    throw new Error(parseError(text, res.status));
  }
  try {
    return JSON.parse(text) as AskResponse;
  } catch {
    throw new Error('Server returned non-JSON response');
  }
}

export class SessionExpiredError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'SessionExpiredError';
  }
}

function parseError(body: string, status: number): string {
  try {
    const j = JSON.parse(body);
    if (j?.reply) return String(j.reply);
    if (j?.error) return String(j.error);
  } catch {
    // ignore
  }
  return `HTTP ${status}`;
}

function networkErrorMessage(url: string, err: any): string {
  const isHttps = url.startsWith('https://');
  const raw = err?.message ?? String(err);
  if (isHttps) {
    return (
      `Couldn't reach ${url}.\n\n` +
      `iOS rejects self-signed TLS certs by default. Either:\n` +
      `\u2022 Use http://192.168.50.199:8080 instead (LAN-only, no TLS), or\n` +
      `\u2022 Install + trust the Caddy root cert on this device:\n` +
      `   Settings → General → VPN & Device Management → install profile,\n` +
      `   then Settings → General → About → Certificate Trust Settings.\n\n` +
      `Underlying error: ${raw}`
    );
  }
  return (
    `Couldn't reach ${url}.\n\n` +
    `Check that the iPhone is on the same Wi-Fi as the home-server and that\n` +
    `the URL + port are correct. Underlying error: ${raw}`
  );
}
