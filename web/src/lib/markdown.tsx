import { useMemo, useState } from 'react';
import { Copy, Terminal } from 'lucide-react';
import { API_BASE } from './api';
import { copyToClipboard } from './format';

/**
 * Tiny markdown renderer with code-block actions.
 *
 * Splits input into prose + ```fenced``` blocks. The special language token
 * `tool` produces an interactive {@link ToolCallBlock}; everything else
 * routes through {@link CodeBlock}.
 */
function stripThink(text: string): string {
  let out = text;
  // 1. Drop closed `<think>...</think>` blocks.
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // 2. Some reasoning models stream the chain-of-thought *without* the opening
  //    `<think>` tag and only emit a closing `</think>` before the answer.
  //    Treat everything before the first stray `</think>` as thinking and
  //    discard it.
  const closeIdx = out.search(/<\/think>/i);
  if (closeIdx !== -1) {
    out = out.slice(closeIdx).replace(/^<\/think>/i, '');
  }
  // 3. Drop an unclosed trailing `<think>...` so partial streams don't show
  //    chain-of-thought. If a stream later closes the tag rule (1) catches it
  //    on the next render.
  const openIdx = out.search(/<think>/i);
  if (openIdx !== -1) out = out.slice(0, openIdx);
  return out.trim();
}

export function MarkdownView({ text }: { text: string }) {
  const segments = useMemo(() => {
    // Strip reasoning-model `<think>...</think>` scaffolding that some local
    // LLMs (Qwen3-thinking, DeepSeek-R1) leak into the visible response. We
    // also drop an unclosed trailing `<think>...` so partial streams don't
    // dump the chain-of-thought onto the user.
    const cleaned = stripThink(text);
    const out: Array<{ kind: 'text' | 'code'; lang?: string; body: string }> =
      [];
    const re = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cleaned)) !== null) {
      if (m.index > last)
        out.push({ kind: 'text', body: cleaned.slice(last, m.index) });
      out.push({ kind: 'code', lang: m[1] || '', body: m[2] });
      last = m.index + m[0].length;
    }
    if (last < cleaned.length)
      out.push({ kind: 'text', body: cleaned.slice(last) });
    return out;
  }, [text]);

  return (
    <div className="space-y-2">
      {segments.map((seg, i) =>
        seg.kind === 'code' ? (
          (seg.lang || '').toLowerCase() === 'tool' ? (
            <ToolCallBlock key={i} payload={seg.body} />
          ) : (
            <CodeBlock
              key={i}
              lang={seg.lang || ''}
              code={seg.body.replace(/\n$/, '')}
            />
          )
        ) : (
          <InlineMarkdown key={i} text={seg.body} />
        ),
      )}
    </div>
  );
}

export function InlineMarkdown({ text }: { text: string }) {
  // Render paragraphs separated by blank lines; handle **bold**, *italic*,
  // `code`, and bullet lists.
  const blocks = text.split(/\n{2,}/).filter((b) => b.length > 0);
  return (
    <>
      {blocks.map((b, i) => {
        const isList = b.split('\n').every((l) => /^\s*[-*]\s+/.test(l));
        if (isList) {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {b.split('\n').map((l, j) => (
                <li key={j} className="text-sm leading-relaxed">
                  <InlineSpans text={l.replace(/^\s*[-*]\s+/, '')} />
                </li>
              ))}
            </ul>
          );
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(b);
        if (heading) {
          const level = heading[1].length;
          const sizes = [
            'text-base',
            'text-base',
            'text-sm',
            'text-sm',
            'text-xs',
            'text-xs',
          ];
          return (
            <p
              key={i}
              className={`font-semibold ${sizes[level - 1]} text-foreground`}>
              <InlineSpans text={heading[2]} />
            </p>
          );
        }
        return (
          <p key={i} className="text-sm whitespace-pre-wrap leading-relaxed">
            <InlineSpans text={b} />
          </p>
        );
      })}
    </>
  );
}

export function InlineSpans({ text }: { text: string }) {
  const parts: Array<{
    kind: 'text' | 'code' | 'bold' | 'italic' | 'link';
    body: string;
    href?: string;
  }> = [];
  const re =
    /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last)
      parts.push({ kind: 'text', body: text.slice(last, m.index) });
    if (m[2]) parts.push({ kind: 'bold', body: m[2] });
    else if (m[4]) parts.push({ kind: 'italic', body: m[4] });
    else if (m[6]) parts.push({ kind: 'code', body: m[6] });
    else if (m[8]) parts.push({ kind: 'link', body: m[8], href: m[9] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', body: text.slice(last) });
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === 'bold')
          return (
            <strong key={i} className="font-semibold">
              {p.body}
            </strong>
          );
        if (p.kind === 'italic') return <em key={i}>{p.body}</em>;
        if (p.kind === 'code')
          return (
            <code
              key={i}
              className="px-1 py-px text-sm rounded bg-white/10 font-mono">
              {p.body}
            </code>
          );
        if (p.kind === 'link')
          return (
            <a
              key={i}
              href={p.href}
              target="_blank"
              rel="noreferrer"
              className="underline text-violet-300 hover:text-violet-200">
              {p.body}
            </a>
          );
        return <span key={i}>{p.body}</span>;
      })}
    </>
  );
}

export function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const isShell = /^(sh|bash|zsh|console|shell)$/i.test(lang);
  const isDiff = lang.toLowerCase() === 'diff';
  const onCopy = () => {
    copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="rounded-md border border-white/10 bg-black/40 overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 border-b border-white/5 bg-white/[0.02]">
        <span className="text-xs uppercase tracking-wider text-muted-foreground/70 font-mono">
          {lang || 'text'}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onCopy}
            className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-muted-foreground/60 hover:text-foreground rounded hover:bg-white/5 transition-colors">
            <Copy size={10} />
            {copied ? 'Copied' : 'Copy'}
          </button>
          {isShell && (
            <button
              onClick={() => copyToClipboard(code)}
              title="Copy command — paste into the bottom Terminal tab"
              className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-violet-300/70 hover:text-violet-200 rounded hover:bg-white/5 transition-colors">
              <Terminal size={10} />
              Copy as cmd
            </button>
          )}
        </div>
      </div>
      <pre
        className={`text-sm font-mono p-3 overflow-auto leading-relaxed ${isDiff ? 'diff-block' : ''}`}>
        {isDiff ? (
          code.split('\n').map((l, i) => {
            const cls =
              l.startsWith('+') && !l.startsWith('+++')
                ? 'text-emerald-300 bg-emerald-500/5'
                : l.startsWith('-') && !l.startsWith('---')
                  ? 'text-red-300 bg-red-500/5'
                  : l.startsWith('@@')
                    ? 'text-violet-300/70'
                    : 'text-foreground/70';
            return (
              <div key={i} className={`${cls} whitespace-pre`}>
                {l || ' '}
              </div>
            );
          })
        ) : (
          <code className="text-foreground/85">{code}</code>
        )}
      </pre>
    </div>
  );
}

/**
 * ToolCallBlock renders an assistant-suggested tool invocation.
 *
 * Payload is a JSON object: `{ "name": "ragSearch", "args": { "q": "docker" } }`.
 * Clicking "Run" POSTs to `/api/tools/run/{name}` and shows the result inline.
 */
export function ToolCallBlock({ payload }: { payload: string }) {
  const [result, setResult] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  let parsed: { name?: string; args?: Record<string, unknown> } = {};
  try {
    parsed = JSON.parse(payload);
  } catch {
    parsed = {};
  }
  const name = parsed.name || '(unknown)';
  const run = async () => {
    if (!parsed.name) return;
    setRunning(true);
    setErr(null);
    try {
      const r = await fetch(
        `${API_BASE}/api/tools/run/${encodeURIComponent(parsed.name)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.args || {}),
        },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'failed');
      setResult(JSON.stringify(data.result, null, 2));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setRunning(false);
    }
  };
  return (
    <div className="rounded-md border border-violet-400/30 bg-violet-500/5 overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 border-b border-violet-400/20 bg-violet-500/10">
        <span className="text-xs uppercase tracking-wider text-violet-300/80 font-mono">
          tool · {name}
        </span>
        <button
          onClick={run}
          disabled={running || !parsed.name}
          className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-violet-200 hover:bg-violet-500/20 rounded transition-colors disabled:opacity-40">
          {running ? 'Running…' : 'Run'}
        </button>
      </div>
      <pre className="text-xs font-mono p-2 overflow-auto text-violet-100/70">
        {JSON.stringify(parsed.args || {}, null, 2)}
      </pre>
      {err && (
        <div className="px-2 py-1 text-xs text-red-300 border-t border-violet-400/20 bg-red-500/10">
          {err}
        </div>
      )}
      {result && (
        <pre className="text-xs font-mono p-2 overflow-auto max-h-72 border-t border-violet-400/20 text-foreground/80 bg-black/30">
          {result}
        </pre>
      )}
    </div>
  );
}

/** Side-by-side view of `/api/chat/compare` results. */
export function CompareBlock({ payload }: { payload: string }) {
  let data: {
    pending?: boolean;
    routes?: string[];
    runs?: Array<{
      route: string;
      node: string;
      text?: string;
      ms: number;
      error?: string;
    }>;
  } = {};
  try {
    data = JSON.parse(payload);
  } catch {
    return <div className="text-xs text-red-400">Invalid compare payload.</div>;
  }
  if (data.pending) {
    return (
      <div className="text-xs text-violet-300/80 italic">
        Fanning out to {(data.routes || []).join(', ')}…
      </div>
    );
  }
  const runs = data.runs || [];
  if (runs.length === 0)
    return (
      <div className="text-xs text-muted-foreground">No compare results.</div>
    );
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {runs.map((r, i) => (
        <div
          key={i}
          className="rounded-md border border-violet-400/20 bg-violet-500/5 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-2 py-1 border-b border-violet-400/20 bg-violet-500/10 text-xs">
            <span className="font-mono text-violet-200">
              {r.route} · {r.node || '—'}
            </span>
            <span className="text-muted-foreground/60 tabular-nums">
              {r.ms} ms
            </span>
          </div>
          <div className="p-2 text-sm overflow-auto max-h-96">
            {r.error ? (
              <div className="text-red-300">{r.error}</div>
            ) : (
              <MarkdownView text={r.text || ''} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
