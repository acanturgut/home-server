import { useMemo } from 'react';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';

interface Row {
  name: string;
  tier: string;
  requests: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  prompt: number;
  completion: number;
  total: number;
  tps: number; // tokens per second (completion / latency seconds)
}

function parseLatency(s?: string): number | null {
  if (!s) return null;
  if (s.endsWith('ms')) return parseFloat(s);
  if (s.endsWith('µs') || s.endsWith('us')) return parseFloat(s) / 1000;
  if (s.endsWith('s')) return parseFloat(s) * 1000;
  return null;
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

function fmtLat(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return ms > 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(0)}ms`;
}

const TIER_COLOR: Record<string, string> = {
  'high-end': '#60a5fa',
  'low-end': '#a78bfa',
  local: '#34d399',
};

/** Per-model performance leaderboard. Single dense table replaces what
 * was previously split across "Top Models" + TokenUsage by-model bars. */
export function ModelLeaderboard() {
  const { logs } = useDashboardData();

  const rows = useMemo<Row[]>(() => {
    const acc = new Map<
      string,
      {
        tier: string;
        requests: number;
        latencies: number[];
        prompt: number;
        completion: number;
        total: number;
        completionWithLat: number;
        latSecsForCompletion: number;
      }
    >();
    logs.forEach((l) => {
      if (!l.model) return;
      const key = l.model;
      const lat = parseLatency(l.latency);
      const a = acc.get(key) || {
        tier: l.tier || 'unknown',
        requests: 0,
        latencies: [],
        prompt: 0,
        completion: 0,
        total: 0,
        completionWithLat: 0,
        latSecsForCompletion: 0,
      };
      a.tier = l.tier || a.tier;
      a.requests += 1;
      if (lat != null) a.latencies.push(lat);
      const pt = l.prompt_tokens || 0;
      const ct = l.completion_tokens || 0;
      const tt = l.total_tokens || pt + ct;
      a.prompt += pt;
      a.completion += ct;
      a.total += tt;
      if (lat != null && ct > 0) {
        a.completionWithLat += ct;
        a.latSecsForCompletion += lat / 1000;
      }
      acc.set(key, a);
    });
    return Array.from(acc.entries())
      .map(([name, a]) => {
        const sorted = a.latencies.slice().sort((x, y) => x - y);
        const avg = sorted.length
          ? sorted.reduce((s, v) => s + v, 0) / sorted.length
          : 0;
        const p95 =
          sorted.length === 0
            ? 0
            : sorted[
                Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
              ];
        const tps =
          a.latSecsForCompletion > 0
            ? a.completionWithLat / a.latSecsForCompletion
            : 0;
        return {
          name,
          tier: a.tier,
          requests: a.requests,
          avgLatencyMs: avg,
          p95LatencyMs: p95,
          prompt: a.prompt,
          completion: a.completion,
          total: a.total,
          tps,
        };
      })
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 8);
  }, [logs]);

  const maxReq = rows.reduce((m, r) => Math.max(m, r.requests), 0) || 1;
  const maxTok = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1;

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-foreground/80">
            Model Leaderboard
          </p>
          <p className="text-xs text-muted-foreground/60">
            Per-model throughput · latency · tokens
          </p>
        </div>
        <span className="text-xs text-muted-foreground/65 tabular-nums">
          {rows.length} models
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground/65 italic">
          No model traffic yet
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground/60">
                <th className="text-left font-medium py-1 pr-2">Model</th>
                <th className="text-left font-medium py-1 pr-2">Tier</th>
                <th className="text-right font-medium py-1 pr-2">Req</th>
                <th className="text-right font-medium py-1 pr-2">Avg</th>
                <th className="text-right font-medium py-1 pr-2">p95</th>
                <th className="text-right font-medium py-1 pr-2">Tok/s</th>
                <th className="text-right font-medium py-1 pr-2">In</th>
                <th className="text-right font-medium py-1 pr-2">Out</th>
                <th className="text-right font-medium py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tierColor = TIER_COLOR[r.tier] || '#94a3b8';
                return (
                  <tr
                    key={r.name}
                    className="border-t border-border/10 hover:bg-white/[0.02]">
                    <td className="py-1 pr-2 max-w-[160px] truncate text-foreground/85">
                      {r.name}
                    </td>
                    <td className="py-1 pr-2">
                      <span
                        className="inline-flex items-center gap-1 px-1 rounded text-xs"
                        style={{
                          background: `${tierColor}20`,
                          color: tierColor,
                        }}>
                        {r.tier}
                      </span>
                    </td>
                    <td className="py-1 pr-2 text-right relative">
                      <span className="relative z-10">{r.requests}</span>
                      <span
                        className="absolute inset-y-0.5 right-2 left-auto rounded-sm bg-blue-400/10"
                        style={{ width: `${(r.requests / maxReq) * 60}px` }}
                      />
                    </td>
                    <td className="py-1 pr-2 text-right text-foreground/70">
                      {fmtLat(r.avgLatencyMs)}
                    </td>
                    <td className="py-1 pr-2 text-right text-amber-400/80">
                      {fmtLat(r.p95LatencyMs)}
                    </td>
                    <td className="py-1 pr-2 text-right text-emerald-400/80">
                      {r.tps > 0 ? r.tps.toFixed(0) : '—'}
                    </td>
                    <td className="py-1 pr-2 text-right text-blue-400/70">
                      {fmt(r.prompt)}
                    </td>
                    <td className="py-1 pr-2 text-right text-emerald-400/70">
                      {fmt(r.completion)}
                    </td>
                    <td className="py-1 text-right text-pink-400/80 relative">
                      <span className="relative z-10">{fmt(r.total)}</span>
                      <span
                        className="absolute inset-y-0.5 right-0 rounded-sm bg-pink-400/10"
                        style={{ width: `${(r.total / maxTok) * 60}px` }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
