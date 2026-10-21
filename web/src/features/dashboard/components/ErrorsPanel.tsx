import { useMemo } from 'react';
import { CircleCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';
import { formatTime, plural } from '@/lib/format';
import { cn } from '@/lib/utils';

const WINDOW_MS = 60 * 60_000;
const MAX_GROUPS = 5;

interface ProblemGroup {
  message: string;
  level: string;
  count: number;
  last: string;
}

/** Errors and warnings from the last hour, identical messages grouped. */
export function ErrorsPanel() {
  const { logs, lastTick } = useDashboardData();

  const { errors, warnings, groups } = useMemo(() => {
    // "Now" is when the logs were fetched, keeping this memo pure.
    const recent = logs.filter(
      (l) =>
        (l.level === 'ERROR' || l.level === 'WARN') &&
        lastTick - Date.parse(l.timestamp) < WINDOW_MS,
    );
    const byMessage = new Map<string, ProblemGroup>();
    for (const l of recent) {
      const g = byMessage.get(l.message);
      if (!g) {
        byMessage.set(l.message, {
          message: l.message,
          level: l.level,
          count: 1,
          last: l.timestamp,
        });
      } else {
        g.count++;
        if (l.timestamp > g.last) g.last = l.timestamp;
      }
    }
    const errorCount = recent.filter((l) => l.level === 'ERROR').length;
    return {
      errors: errorCount,
      warnings: recent.length - errorCount,
      groups: [...byMessage.values()]
        .sort((a, b) => b.last.localeCompare(a.last))
        .slice(0, MAX_GROUPS),
    };
  }, [logs, lastTick]);

  return (
    <Card className="space-y-4">
      <CardHeader
        title="Errors and warnings"
        description="Last hour"
        actions={
          groups.length > 0 && (
            <div className="flex gap-1.5">
              {errors > 0 && (
                <Badge tone="destructive">{plural(errors, 'error')}</Badge>
              )}
              {warnings > 0 && (
                <Badge tone="warning">{plural(warnings, 'warning')}</Badge>
              )}
            </div>
          )
        }
      />
      {groups.length === 0 ? (
        <EmptyState
          icon={<CircleCheck />}
          title="All clear"
          description="No errors or warnings in the last hour."
        />
      ) : (
        <ul className="space-y-1">
          {groups.map((g) => (
            <li key={g.message} className="rounded-md bg-muted/50 px-3 py-2">
              <p className="text-sm break-words">{g.message}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span
                  className={cn(
                    'font-medium',
                    g.level === 'ERROR' ? 'text-destructive' : 'text-warning',
                  )}
                >
                  {g.level === 'ERROR' ? 'Error' : 'Warning'}
                </span>
                {g.count > 1 && ` · ${g.count}×`} · last at {formatTime(g.last)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
