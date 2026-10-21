import { useMemo } from 'react';
import { AlertTriangle, AlertOctagon } from 'lucide-react';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';

/** Errors & warnings panel: counts + last few problem entries. Surfaces
 * what's broken without forcing the user to scan the full activity feed. */
export function ErrorsPanel() {
  const { logs, lastTick } = useDashboardData();

  const stats = useMemo(() => {
    let errors = 0;
    let warns = 0;
    let infos = 0;
    let recent5m = 0;
    // "Now" is the time the logs were fetched, keeping this memo pure.
    const now = lastTick;
    const items: {
      time: string;
      level: string;
      message: string;
      node?: string;
    }[] = [];
    logs.forEach((l) => {
      const lvl = (l.level || 'INFO').toUpperCase();
      if (lvl === 'ERROR') errors += 1;
      else if (lvl === 'WARN' || lvl === 'WARNING') warns += 1;
      else infos += 1;
      if (l.timestamp && now - new Date(l.timestamp).getTime() < 5 * 60_000) {
        if (lvl === 'ERROR' || lvl === 'WARN' || lvl === 'WARNING')
          recent5m += 1;
      }
      if (lvl === 'ERROR' || lvl === 'WARN' || lvl === 'WARNING') {
        items.push({
          time: l.timestamp,
          level: lvl,
          message: l.message || '',
          node: l.node,
        });
      }
    });
    items.sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
    );
    const total = errors + warns + infos;
    const errorRate = total > 0 ? (errors / total) * 100 : 0;
    return {
      errors,
      warns,
      infos,
      total,
      errorRate,
      recent5m,
      items: items.slice(0, 6),
    };
  }, [logs, lastTick]);

  const ok = stats.errors === 0 && stats.warns === 0;

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-foreground/80">
            Errors & Warnings
          </p>
          <p className="text-xs text-muted-foreground/60">
            Last 5m:{' '}
            <span className="tabular-nums text-foreground/80">
              {stats.recent5m}
            </span>
            <span className="mx-1.5">·</span>
            error rate{' '}
            <span className="tabular-nums text-foreground/80">
              {stats.errorRate.toFixed(1)}%
            </span>
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="flex items-center gap-1 text-red-400/90">
            <AlertOctagon size={12} />
            <span className="tabular-nums">{stats.errors}</span>
          </span>
          <span className="flex items-center gap-1 text-amber-400/90">
            <AlertTriangle size={12} />
            <span className="tabular-nums">{stats.warns}</span>
          </span>
        </div>
      </div>
      {ok ? (
        <div className="h-[110px] flex items-center justify-center text-xs text-emerald-400/70">
          ✓ All systems clean
        </div>
      ) : (
        <div className="space-y-1 max-h-[140px] overflow-auto pr-1">
          {stats.items.map((it, i) => {
            const time = it.time
              ? new Date(it.time).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : '';
            const isErr = it.level === 'ERROR';
            return (
              <div
                key={`${it.time}-${i}`}
                className={`flex items-start gap-2 text-xs py-1 px-1.5 rounded border-l-2 ${
                  isErr
                    ? 'border-red-500/60 bg-red-500/[0.06]'
                    : 'border-amber-500/60 bg-amber-500/[0.04]'
                }`}>
                <span className="text-xs text-muted-foreground/70 font-mono shrink-0 w-14 mt-0.5">
                  {time}
                </span>
                <span
                  className={`text-xs font-mono uppercase shrink-0 px-1 rounded w-10 text-center ${
                    isErr
                      ? 'text-red-400 bg-red-500/15'
                      : 'text-amber-400 bg-amber-500/10'
                  }`}>
                  {it.level}
                </span>
                <span className="text-foreground/80 truncate flex-1 min-w-0">
                  {it.message}
                </span>
                {it.node && (
                  <span className="text-xs text-muted-foreground/70 font-mono shrink-0">
                    {it.node}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
