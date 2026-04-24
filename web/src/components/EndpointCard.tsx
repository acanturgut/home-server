import { useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { API_BASE } from '@/lib/api';
import type { Endpoint } from '@/lib/types';

/** HTTP method colour mapping used by `EndpointCard`. */
const METHOD_COLORS: Record<string, string> = {
  GET: 'text-emerald-400',
  POST: 'text-blue-400',
  PUT: 'text-amber-400',
  DELETE: 'text-red-400',
};

/**
 * Collapsible API explorer card: shows a single endpoint, lets the user fill
 * path params / query params / body, executes it (streaming for `/api/chat/stream`),
 * and renders the response inline with status colouring.
 */
export function EndpointCard({ ep }: { ep: Endpoint }) {
  const [body, setBody] = useState(ep.body || '');
  const [params, setParams] = useState<Record<string, string>>(() => {
    const p: Record<string, string> = {};
    ep.pathParams?.forEach((k) => (p[k] = ''));
    ep.queryParams?.forEach((q) => (p[q.name] = q.default || ''));
    return p;
  });
  const [response, setResponse] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const buildUrl = useCallback(() => {
    let url = `${API_BASE}${ep.path}`;
    ep.pathParams?.forEach((k) => {
      url = url.replace(`{${k}}`, encodeURIComponent(params[k] || ''));
    });
    if (ep.queryParams?.length) {
      const qs = ep.queryParams
        .filter((q) => params[q.name])
        .map((q) => `${q.name}=${encodeURIComponent(params[q.name])}`)
        .join('&');
      if (qs) url += `?${qs}`;
    }
    return url;
  }, [ep, params]);

  const execute = async () => {
    setLoading(true);
    setResponse(null);
    setStatus(null);
    try {
      const url = buildUrl();
      const opts: RequestInit = { method: ep.method };
      if (body && (ep.method === 'POST' || ep.method === 'PUT')) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = body;
      }
      if (ep.path === '/api/chat/stream') {
        const res = await fetch(url, opts);
        setStatus(res.status);
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let text = '';
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
            setResponse(text);
          }
        }
      } else {
        const res = await fetch(url, opts);
        setStatus(res.status);
        const text = await res.text();
        try {
          setResponse(JSON.stringify(JSON.parse(text), null, 2));
        } catch {
          setResponse(text);
        }
      }
    } catch (e: unknown) {
      setResponse(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setStatus(0);
    }
    setLoading(false);
  };

  return (
    <div className="border-b border-border/10 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 py-2 px-1 text-left hover:bg-white/[0.02] transition-colors">
        <span
          className={`font-mono text-[10px] font-semibold w-12 shrink-0 ${METHOD_COLORS[ep.method]}`}>
          {ep.method}
        </span>
        <code className="text-[11px] font-mono text-foreground/70 flex-1 min-w-0 truncate">
          {ep.path}
        </code>
        <span className="text-[10px] text-muted-foreground/40 hidden sm:block truncate max-w-[200px]">
          {ep.summary}
        </span>
        <ChevronDown
          size={12}
          className={`text-muted-foreground/30 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="pb-3 px-1 space-y-2.5">
          <p className="text-[10px] text-muted-foreground/60">{ep.summary}</p>
          {ep.pathParams?.map((k) => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground/40 w-16 shrink-0">
                :{k}
              </span>
              <input
                placeholder={k}
                value={params[k] || ''}
                onChange={(e) =>
                  setParams((p) => ({ ...p, [k]: e.target.value }))
                }
                className="flex-1 h-6 text-[11px] font-mono bg-transparent border-b border-border/20 focus:border-foreground/30 focus:outline-none px-1 transition-colors"
              />
            </div>
          ))}
          {ep.queryParams?.map((q) => (
            <div key={q.name} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground/40 w-16 shrink-0">
                ?{q.name}
              </span>
              <input
                placeholder={q.default || q.name}
                value={params[q.name] || ''}
                onChange={(e) =>
                  setParams((p) => ({ ...p, [q.name]: e.target.value }))
                }
                className="flex-1 h-6 text-[11px] font-mono bg-transparent border-b border-border/20 focus:border-foreground/30 focus:outline-none px-1 transition-colors"
              />
            </div>
          ))}
          {ep.body && (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full font-mono text-[10px] bg-white/[0.02] border border-border/15 rounded p-2 min-h-[80px] resize-y focus:outline-none focus:border-foreground/20 transition-colors"
              spellCheck={false}
            />
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={execute}
              disabled={loading}
              className="px-3 py-1 rounded text-[10px] font-medium bg-foreground/10 hover:bg-foreground/15 disabled:opacity-40 transition-colors">
              {loading ? '...' : 'Run'}
            </button>
            <code className="text-[9px] text-muted-foreground/30 truncate">
              {buildUrl()}
            </code>
          </div>
          {response !== null && (
            <div className="space-y-1">
              {status !== null && (
                <span
                  className={`text-[10px] font-mono ${status >= 200 && status < 300 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {status}
                </span>
              )}
              <pre className="text-[10px] font-mono text-foreground/60 bg-black/20 rounded p-2 max-h-[300px] overflow-auto whitespace-pre-wrap break-words">
                {response}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
