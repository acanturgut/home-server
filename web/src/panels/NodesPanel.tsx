import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '@/lib/api';
import { formatUptime } from '@/lib/format';
import type { NodeStats } from '@/lib/types';

/** Live, auto-refreshing list of cluster nodes with CPU/Mem/Disk/GPU bars. */
export function NodesPanel() {
  const [stats, setStats] = useState<Record<string, NodeStats>>({});
  const [nodes, setNodes] = useState<
    { id: string; name: string; host: string; mac?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    Promise.all([
      fetch(`${API_BASE}/api/nodes/stats`).then((r) => r.json()),
      fetch(`${API_BASE}/api/nodes`).then((r) => r.json()),
    ])
      .then(([s, n]) => {
        setStats(s && typeof s === 'object' && !Array.isArray(s) ? s : {});
        setNodes(Array.isArray(n) ? n : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);

  if (loading)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <span className="inline-block w-3.5 h-3.5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
        Loading nodes...
      </div>
    );

  const onlineNodes = nodes.filter((n) => stats[n.id]);
  const offlineNodes = nodes.filter((n) => !stats[n.id]);
  // Show agent-only nodes (reporting via heartbeat but not in config)
  const configuredIds = new Set(nodes.map((n) => n.id));
  const agentOnlyNodes = Object.keys(stats)
    .filter((id) => !configuredIds.has(id))
    .map((id) => ({
      id,
      name: stats[id].hostname || id,
      host: '',
    }));

  return (
    <div className="space-y-2">
      {onlineNodes.length === 0 &&
        agentOnlyNodes.length === 0 &&
        offlineNodes.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No nodes configured
          </p>
        )}
      {[...onlineNodes, ...agentOnlyNodes].map((n) => {
        const s = stats[n.id];
        const isOnline =
          new Date().getTime() - new Date(s.last_seen).getTime() < 30000;
        return (
          <div
            key={n.id}
            className="rounded-lg border border-border/30 p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`}
              />
              <span className="text-sm font-medium">
                {s.hostname || n.name}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {s.cpu_model} · {s.cpu_cores}c · Up{' '}
                {formatUptime(s.uptime_secs)}
              </span>
            </div>
            {/* Inline bars */}
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: 'CPU',
                  pct: s.cpu_usage,
                  color: '#3b82f6',
                  extra: s.cpu_temp ? `${s.cpu_temp}°C` : '',
                },
                {
                  label: 'Mem',
                  pct: s.mem_pct,
                  color: '#a855f7',
                  extra: `${s.mem_used_gb.toFixed(1)}/${s.mem_total_gb.toFixed(1)}G`,
                },
                {
                  label: 'Disk',
                  pct: s.disk_pct,
                  color: '#f59e0b',
                  extra: `${s.disk_used_gb.toFixed(0)}/${s.disk_total_gb.toFixed(0)}G`,
                },
              ].map((b) => (
                <div key={b.label} className="space-y-0.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">{b.label}</span>
                    <span className="tabular-nums" style={{ color: b.color }}>
                      {b.pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${b.pct}%`, backgroundColor: b.color }}
                    />
                  </div>
                  {b.extra && (
                    <p className="text-[9px] text-muted-foreground/50">
                      {b.extra}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {/* GPU */}
            {s.gpu_name && (
              <div className="flex items-center gap-3 text-[10px]">
                <span className="text-emerald-400 font-medium">
                  {s.gpu_name}
                </span>
                {s.gpu_usage != null && (
                  <span className="text-muted-foreground">
                    GPU {s.gpu_usage}%
                  </span>
                )}
                {s.gpu_mem_total_mb != null && s.gpu_mem_total_mb > 0 && (
                  <span className="text-muted-foreground">
                    VRAM {s.gpu_mem_used_mb}/{s.gpu_mem_total_mb}MB
                  </span>
                )}
                {s.gpu_temp != null && (
                  <span className="text-muted-foreground">{s.gpu_temp}°C</span>
                )}
              </div>
            )}
          </div>
        );
      })}
      {offlineNodes.length > 0 && (
        <div className="px-1 space-y-1">
          {offlineNodes.map((n) => (
            <div
              key={n.id}
              className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
              {n.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
