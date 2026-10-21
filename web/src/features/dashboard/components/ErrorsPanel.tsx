import { useMemo } from 'react';
import { CircleCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';
import { LogLine } from '@/features/logs';
import { plural } from '@/lib/format';

const RECENT_MS = 5 * 60_000;
const isProblem = (level: string) => level === 'ERROR' || level === 'WARN';

/** Error / warning counts and the latest few problem entries from the shared logs. */
export function ErrorsPanel() {
  const { logs, lastTick } = useDashboardData();

  const stats = useMemo(() => {
    // "Now" is when the logs were fetched, keeping this memo pure.
    const problems = logs.filter((l) => isProblem(l.level));
    const errors = problems.filter((l) => l.level === 'ERROR').length;
    const recent = problems.filter(
      (l) => lastTick - Date.parse(l.timestamp) < RECENT_MS,
    ).length;
    const latest = [...problems]
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, 6);
    return {
      errors,
      warnings: problems.length - errors,
      recent,
      errorRate: logs.length ? (errors / logs.length) * 100 : 0,
      latest,
    };
  }, [logs, lastTick]);

  return (
    <Card className="space-y-3">
      <CardHeader
        title="Errors and warnings"
        description={`${stats.recent} in the last 5 min · ${stats.errorRate.toFixed(1)}% error rate`}
      />
      <div className="flex gap-2">
        <Badge tone="destructive">{plural(stats.errors, 'error')}</Badge>
        <Badge tone="warning">{plural(stats.warnings, 'warning')}</Badge>
      </div>
      {stats.latest.length === 0 ? (
        <EmptyState
          icon={<CircleCheck />}
          title="All clear"
          description="No errors or warnings in the recent logs."
        />
      ) : (
        <ul>
          {stats.latest.map((entry, i) => (
            <LogLine key={`${entry.timestamp}-${i}`} entry={entry} />
          ))}
        </ul>
      )}
    </Card>
  );
}
