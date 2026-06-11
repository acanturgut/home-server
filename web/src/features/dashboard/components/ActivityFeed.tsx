import { useMemo } from 'react';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';

const LEVEL_COLORS: Record<string, string> = {
  ERROR: 'text-red-400 bg-red-500/10 border-red-500/20',
  WARN: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  INFO: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  DEBUG: 'text-muted-foreground bg-muted/30 border-border/30',
};

/** Recent activity feed: tails the server log buffer with severity badges. */
export function ActivityFeed() {
  const { logs: raw } = useDashboardData();
  const logs = useMemo(() => raw.slice(-40).reverse(), [raw]);

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-foreground/80">Activity</p>
          <p className="text-xs text-muted-foreground/60">
            Recent server log entries
          </p>
        </div>
        <span className="text-xs text-muted-foreground/65 tabular-nums">
          last {logs.length}
        </span>
      </div>
      <div className="space-y-1 max-h-[420px] overflow-auto pr-1">
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground/65 italic py-4 text-center">
            No activity yet
          </p>
        ) : (
          logs.map((l, i) => {
            const lvl = (l.level || 'INFO').toUpperCase();
            const color = LEVEL_COLORS[lvl] || LEVEL_COLORS.INFO;
            const time = l.timestamp
              ? new Date(l.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : '';
            return (
              <div
                key={`${l.timestamp}-${i}`}
                className="flex items-start gap-2 py-1 px-1.5 rounded text-xs hover:bg-white/[0.02] transition-colors">
                <span className="text-xs text-muted-foreground/65 font-mono shrink-0 w-14 mt-0.5">
                  {time}
                </span>
                <span
                  className={`text-xs font-mono uppercase shrink-0 px-1 rounded border w-12 text-center ${color}`}>
                  {lvl}
                </span>
                <span className="text-foreground/70 truncate flex-1 min-w-0">
                  {l.message}
                </span>
                {l.node && (
                  <span className="text-xs text-muted-foreground/70 font-mono shrink-0">
                    {l.node}
                  </span>
                )}
                {l.latency && (
                  <span className="text-xs text-muted-foreground/65 font-mono tabular-nums shrink-0">
                    {l.latency}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
