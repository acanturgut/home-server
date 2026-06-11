import { useEffect, useState } from 'react';
import {
  Copy,
  Key,
  Loader2,
  Plus,
  RotateCcw,
  Smartphone,
  Trash2,
} from 'lucide-react';

type ApiToken = {
  id: string;
  name: string;
  token: string;
  created_at: string;
  last_used_at?: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function fmtDate(iso?: string): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'never';
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

export function ApiTokensTab() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    void refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ tokens: ApiToken[] }>('/api/tokens');
      setTokens(data.tokens ?? []);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const tok = await api<ApiToken>('/api/tokens', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() }),
      });
      setNewName('');
      setTokens((t) => [tok, ...t]);
      setRevealId(tok.id);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setCreating(false);
    }
  }

  async function onRotate(id: string) {
    if (!confirm('Replace this token with a new secret? Existing clients will stop working until updated.')) return;
    try {
      const tok = await api<ApiToken>(`/api/tokens/${id}/rotate`, { method: 'POST' });
      setTokens((arr) => arr.map((t) => (t.id === id ? tok : t)));
      setRevealId(id);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this token? Clients using it will stop working immediately.')) return;
    try {
      await api(`/api/tokens/${id}`, { method: 'DELETE' });
      setTokens((arr) => arr.filter((t) => t.id !== id));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Key className="h-5 w-5 text-amber-300" /> API Tokens
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Create bearer tokens for the mobile voice app, the iPhone Shortcut,
          or any script that needs to talk to your home server. Each token is
          a single secret — copy it once, store it on the device, rotate or
          delete here.
        </p>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500">
              New token name
            </label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onCreate();
              }}
              placeholder="iPhone Shortcut, Mobile App, Pi script…"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <button
            onClick={onCreate}
            disabled={creating || !newName.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black hover:bg-amber-400 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-zinc-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : tokens.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 p-8 text-center text-zinc-500">
            No API tokens yet. Create one above.
          </div>
        ) : (
          tokens.map((t) => {
            const revealed = revealId === t.id;
            const masked =
              t.token.slice(0, 6) + '…' + t.token.slice(-4) + ` (${t.token.length} chars)`;
            return (
              <div
                key={t.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-white">
                      <Key className="h-4 w-4 text-amber-300" />
                      <span className="truncate font-medium">{t.name}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Created {fmtDate(t.created_at)} · Last used {fmtDate(t.last_used_at)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => onRotate(t.id)}
                      title="Rotate (generate a new secret)"
                      className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDelete(t.id)}
                      title="Delete"
                      className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300">
                  <span className="flex-1 truncate">{revealed ? t.token : masked}</span>
                  <button
                    onClick={() => setRevealId(revealed ? null : t.id)}
                    className="rounded px-2 py-1 text-[11px] font-medium text-amber-300 hover:bg-zinc-800"
                  >
                    {revealed ? 'Hide' : 'Show'}
                  </button>
                  <button
                    onClick={() => copy(t.token, t.id)}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-amber-300 hover:bg-zinc-800"
                  >
                    <Copy className="h-3 w-3" />
                    {copiedId === t.id ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <Smartphone className="h-4 w-4 text-sky-400" /> How clients use these tokens
        </h3>
        <p className="text-sm text-zinc-400">
          Send any token in the <code className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-200">Authorization</code>{' '}
          header on a POST to <code className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-200">/api/ai/ask</code>:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
          {`curl -X POST ${origin || 'https://your-server'}/api/ai/ask \\
  -H 'Authorization: Bearer <token>' \\
  -H 'Content-Type: application/json' \\
  -d '{"prompt":"Turn off the lights"}'`}
        </pre>
        <p className="mt-3 text-xs text-zinc-500">
          The same endpoint powers the React Native voice app, the Apple
          Shortcut, and any script. Home-control phrases (turn on/off, dim,
          status) execute directly. Everything else routes to your local LLM
          with a fresh snapshot of the home as context.
        </p>
      </section>
    </div>
  );
}
