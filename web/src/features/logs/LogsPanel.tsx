import { useState, useEffect, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { logsApi } from '@/features/logs/api';
import type { LogEntry } from '@/lib/types';

/** Filterable, auto-polling viewer for the server's structured logs. */
export function LogsPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('ALL');

  const fetchLogs = useCallback(() => {
    logsApi
      .list(500)
      .then((data) => setLogs(Array.isArray(data) ? [...data].reverse() : []));
  }, []);

  useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, 3000);
    return () => clearInterval(id);
  }, [fetchLogs]);

  const filtered = logs.filter((l) => {
    if (levelFilter !== 'ALL' && l.level !== levelFilter) return false;
    if (filter && !l.message.toLowerCase().includes(filter.toLowerCase()))
      return false;
    return true;
  });

  return (
    <div className="space-y-2">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <input
          placeholder="Filter..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-7 text-xs flex-1 rounded-md border border-border/30 bg-transparent px-2 focus:outline-none focus:ring-1 focus:ring-ring/30"
        />
        {['ALL', 'INFO', 'ERROR'].map((lv) => (
          <button
            key={lv}
            onClick={() => setLevelFilter(lv)}
            className={`text-xs px-2 py-1 rounded-md transition-colors ${
              levelFilter === lv
                ? 'bg-foreground/10 text-foreground'
                : lv === 'ERROR'
                  ? 'text-red-400/60 hover:text-red-400'
                  : 'text-muted-foreground hover:text-foreground'
            }`}>
            {lv}
          </button>
        ))}
        <button
          onClick={fetchLogs}
          className="text-xs text-muted-foreground hover:text-foreground">
          ↻
        </button>
      </div>

      {/* Log list */}
      <div className="rounded-lg border border-border/30 overflow-hidden">
        <ScrollArea className="h-[200px]">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              No logs
            </p>
          ) : (
            <div className="divide-y divide-border/10">
              {filtered.map((l, i) => (
                <div
                  key={i}
                  className="px-3 py-1 hover:bg-muted/10 transition-colors">
                  <div className="flex items-start gap-2 text-xs font-mono">
                    <span className="text-muted-foreground/70 shrink-0 w-[62px] tabular-nums">
                      {l.timestamp
                        ? new Date(l.timestamp).toLocaleTimeString()
                        : ''}
                    </span>
                    <span
                      className={`shrink-0 w-[38px] ${l.level === 'ERROR' ? 'text-red-400' : 'text-emerald-400/60'}`}>
                      {l.level}
                    </span>
                    <span className="text-foreground/70 break-all flex-1">
                      {l.message}
                    </span>
                  </div>
                  {(l.route || l.model || l.node || l.latency) && (
                    <div className="flex gap-2 ml-[108px] mt-0.5 text-xs">
                      {l.route && (
                        <span className="text-blue-400/60">{l.route}</span>
                      )}
                      {l.model && (
                        <span className="text-purple-400/60">{l.model}</span>
                      )}
                      {l.node && (
                        <span className="text-amber-400/60">{l.node}</span>
                      )}
                      {l.latency && (
                        <span className="text-muted-foreground/65">
                          {l.latency}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
      <p className="text-xs text-muted-foreground/65 text-center">
        {filtered.length}/{logs.length} entries
      </p>
    </div>
  );
}
