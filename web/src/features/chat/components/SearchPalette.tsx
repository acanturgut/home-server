import { useEffect, useMemo, useRef } from 'react';
import { Search } from 'lucide-react';
import type { ChatSession } from '@/features/chat/types';

/** ⌘K-style fuzzy search palette over chat sessions and message contents. */
export function SearchPalette(props: {
  sessions: ChatSession[];
  query: string;
  setQuery: (v: string) => void;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { sessions, query, setQuery, onPick, onClose } = props;
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q)
      return sessions.slice(0, 30).sort((a, b) => b.updatedAt - a.updatedAt);
    const out: Array<{ session: ChatSession; snippet: string; score: number }> =
      [];
    for (const s of sessions) {
      const titleHit = s.title.toLowerCase().includes(q);
      let snippet = '';
      let score = titleHit ? 100 : 0;
      for (const m of s.messages) {
        if (m.role === 'system') continue;
        const idx = m.content.toLowerCase().indexOf(q);
        if (idx !== -1) {
          score += 10;
          if (!snippet) {
            const start = Math.max(0, idx - 30);
            snippet =
              (start > 0 ? '…' : '') +
              m.content.slice(start, idx + q.length + 60).replace(/\n/g, ' ');
          }
        }
      }
      if (score > 0)
        out.push({ session: s, snippet: snippet || s.title, score });
    }
    return out
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map(
        (r) =>
          ({ ...r.session, _snippet: r.snippet }) as ChatSession & {
            _snippet?: string;
          },
      );
  }, [sessions, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-24"
      onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[640px] max-w-[92vw] bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
          <Search size={12} className="text-muted-foreground/60" />
          <input
            ref={ref}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && results[0]) onPick(results[0].id);
            }}
            placeholder="Search chats and messages…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
          />
          <span className="text-[10px] text-muted-foreground/40">Esc</span>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          {results.length === 0 && (
            <div className="px-3 py-6 text-center text-[12px] text-muted-foreground/40">
              No matches
            </div>
          )}
          {results.map((s) => (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              className="w-full text-left px-3 py-2 hover:bg-white/5 border-b border-white/5">
              <div className="text-[12px] text-foreground/90 truncate">
                {s.title}
              </div>
              {(s as ChatSession & { _snippet?: string })._snippet && (
                <div className="text-[10px] text-muted-foreground/60 truncate">
                  {(s as ChatSession & { _snippet?: string })._snippet}
                </div>
              )}
              <div className="text-[9px] text-muted-foreground/40 font-mono">
                {new Date(s.updatedAt).toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
