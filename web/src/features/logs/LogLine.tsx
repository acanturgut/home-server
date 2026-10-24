import { formatTime } from '@/lib/format';
import type { LogEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

const LEVEL_CLASS: Record<string, string> = {
  ERROR: 'text-destructive',
  WARN: 'text-warning',
};

/** One structured server log row (time, level, message, request meta). Render inside a `<ul>`. */
export function LogLine({ entry }: { entry: LogEntry }) {
  const meta = [entry.route, entry.model, entry.node, entry.latency]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className="flex items-start gap-2 rounded-sm px-3 py-1 font-mono text-xs even:bg-muted/30">
      <time
        dateTime={entry.timestamp}
        className="shrink-0 text-muted-foreground tabular-nums"
      >
        {formatTime(entry.timestamp, { seconds: true })}
      </time>
      <span
        className={cn(
          'w-10 shrink-0',
          LEVEL_CLASS[entry.level] ?? 'text-muted-foreground',
        )}
      >
        {entry.level}
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-all text-foreground">{entry.message}</p>
        {meta && <p className="text-muted-foreground">{meta}</p>}
      </div>
    </li>
  );
}
