import { useCallback, useState } from 'react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { RefreshButton } from '@/components/ui/refresh-button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useAction } from '@/hooks/useAction';
import { usePolling } from '@/hooks/usePolling';
import { logsApi } from '@/features/logs/api';
import { LogLine } from '@/features/logs/LogLine';
import type { LogEntry } from '@/lib/types';

type Level = 'ALL' | 'INFO' | 'WARN' | 'ERROR';

const LEVELS: { value: Level; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'INFO', label: 'Info' },
  { value: 'WARN', label: 'Warn' },
  { value: 'ERROR', label: 'Error' },
];

/** Filterable, auto-polling viewer for the server's structured logs. Fills its parent's height. */
export function LogsPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<Level>('ALL');

  const load = useCallback(async () => {
    const data = await logsApi.list(500);
    setLogs(Array.isArray(data) ? [...data].reverse() : []);
  }, []);
  usePolling(load, 3000);
  const refresh = useAction(load);

  const q = query.trim().toLowerCase();
  const filtered = logs.filter(
    (l) =>
      (level === 'ALL' || l.level === level) &&
      (!q || l.message.toLowerCase().includes(q)),
  );

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          type="search"
          inputSize="sm"
          aria-label="Filter logs"
          placeholder="Filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        <SegmentedControl
          size="sm"
          aria-label="Log level"
          value={level}
          onValueChange={setLevel}
          options={LEVELS}
        />
        <RefreshButton onClick={refresh.run} busy={refresh.busy} />
      </div>

      <Card className="min-h-0 flex-1 overflow-y-auto p-0">
        {filtered.length === 0 ? (
          <EmptyState
            title={logs.length ? 'No matching logs' : 'No logs yet'}
            className="py-6"
          />
        ) : (
          <ul>
            {filtered.map((l, i) => (
              <LogLine key={i} entry={l} />
            ))}
          </ul>
        )}
      </Card>
      <p className="text-center text-xs text-muted-foreground tabular-nums">
        {filtered.length} of {logs.length} entries
      </p>
    </div>
  );
}
