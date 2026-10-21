import { useMemo } from 'react';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Meter } from '@/components/ui/meter';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';
import {
  formatCompact,
  formatLatency,
  parseLatency,
  plural,
} from '@/lib/format';
import type { LogEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Row {
  name: string;
  tier: string;
  requests: number;
  avgMs: number;
  p95Ms: number;
  prompt: number;
  completion: number;
  total: number;
  /** Completion tokens per second of latency. */
  tps: number;
}

/** Tier → chart slot, matching LatencyTimeline. */
const TIER_DOT: Record<string, string> = {
  'high-end': 'bg-chart-1',
  'low-end': 'bg-chart-2',
  local: 'bg-chart-3',
};

/** Top 8 models by request count, aggregated from the log window. */
function leaderboard(logs: LogEntry[]): Row[] {
  const acc = new Map<
    string,
    Omit<Row, 'name' | 'avgMs' | 'p95Ms' | 'tps'> & {
      latencies: number[];
      tpsTokens: number;
      tpsSecs: number;
    }
  >();
  for (const l of logs) {
    if (!l.model) continue;
    const a = acc.get(l.model) ?? {
      tier: 'unknown',
      requests: 0,
      latencies: [],
      prompt: 0,
      completion: 0,
      total: 0,
      tpsTokens: 0,
      tpsSecs: 0,
    };
    const lat = parseLatency(l.latency);
    const pt = l.prompt_tokens || 0;
    const ct = l.completion_tokens || 0;
    a.tier = l.tier || a.tier;
    a.requests += 1;
    a.prompt += pt;
    a.completion += ct;
    a.total += l.total_tokens || pt + ct;
    if (lat != null) {
      a.latencies.push(lat);
      if (ct > 0) {
        a.tpsTokens += ct;
        a.tpsSecs += lat / 1000;
      }
    }
    acc.set(l.model, a);
  }
  return [...acc.entries()]
    .map(([name, a]) => {
      const sorted = [...a.latencies].sort((x, y) => x - y);
      const n = sorted.length;
      return {
        name,
        tier: a.tier,
        requests: a.requests,
        avgMs: n ? sorted.reduce((s, v) => s + v, 0) / n : 0,
        p95Ms: n ? sorted[Math.min(n - 1, Math.floor(n * 0.95))] : 0,
        prompt: a.prompt,
        completion: a.completion,
        total: a.total,
        tps: a.tpsSecs > 0 ? a.tpsTokens / a.tpsSecs : 0,
      };
    })
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 8);
}

const NUM = 'px-2 py-1.5 text-right tabular-nums';

/** Per-model requests, latency and token totals. */
export function ModelLeaderboard() {
  const { logs } = useDashboardData();
  const rows = useMemo(() => leaderboard(logs), [logs]);
  const maxReq = Math.max(1, ...rows.map((r) => r.requests));
  const maxTok = Math.max(1, ...rows.map((r) => r.total));

  return (
    <Card className="space-y-3">
      <CardHeader
        title="Model leaderboard"
        description="Requests, latency and tokens per model"
        actions={
          <span className="text-xs text-muted-foreground">
            {plural(rows.length, 'model')}
          </span>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No model traffic yet" />
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full tabular-nums">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Model</th>
                <th className={cn(NUM, 'font-medium')}>Requests</th>
                <th className={cn(NUM, 'font-medium')}>Avg</th>
                <th className={cn(NUM, 'font-medium')}>p95</th>
                <th className={cn(NUM, 'font-medium')}>Tok/s</th>
                <th className={cn(NUM, 'font-medium')}>In</th>
                <th className={cn(NUM, 'font-medium')}>Out</th>
                <th className={cn(NUM, 'font-medium')}>Total</th>
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(odd)]:bg-muted/30">
              {rows.map((r) => (
                <tr key={r.name}>
                  <td className="max-w-48 px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          TIER_DOT[r.tier] ?? 'bg-muted-foreground',
                        )}
                      />
                      <span className="truncate">{r.name}</span>
                    </div>
                    <div className="pl-4 text-xs text-muted-foreground">
                      {r.tier}
                    </div>
                  </td>
                  <td className={NUM}>
                    {r.requests}
                    <Meter
                      value={r.requests}
                      max={maxReq}
                      label={`${r.name} share of requests`}
                      className="mt-1 ml-auto w-14"
                    />
                  </td>
                  <td className={NUM}>{formatLatency(r.avgMs)}</td>
                  <td className={NUM}>{formatLatency(r.p95Ms)}</td>
                  <td className={NUM}>{r.tps > 0 ? r.tps.toFixed(0) : '—'}</td>
                  <td className={NUM}>{formatCompact(r.prompt)}</td>
                  <td className={NUM}>{formatCompact(r.completion)}</td>
                  <td className={NUM}>
                    {formatCompact(r.total)}
                    <Meter
                      value={r.total}
                      max={maxTok}
                      label={`${r.name} share of tokens`}
                      className="mt-1 ml-auto w-14"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
