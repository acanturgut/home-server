import { useState, useEffect, useCallback } from 'react';
import { dashboardApi } from '@/features/dashboard/api';
import { formatUptime } from '@/lib/format';
import type { SystemInfo } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';

/** Compact server-stats card (CPU / memory / disk bars) used on the dashboard. */
export function DashboardPanel() {
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    dashboardApi
      .system()
      .then((d) => setSys(d))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!sys) {
    return (
      <div className="rounded-lg border border-border/30 p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        {loading ? (
          <>
            <Spinner /> Loading...
          </>
        ) : (
          'Server unreachable'
        )}
      </div>
    );
  }

  const MiniBar = ({
    pct,
    color,
    label,
    detail,
  }: {
    pct: number;
    color: string;
    label: string;
    detail: string;
  }) => (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium" style={{ color }}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground/60">{detail}</p>
    </div>
  );

  return (
    <div className="rounded-lg border border-border/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{sys.hostname}</p>
          <p className="text-[11px] text-muted-foreground">
            {sys.os}/{sys.arch} · Up {formatUptime(sys.uptime_seconds)}
          </p>
        </div>
        <button
          onClick={refresh}
          className="text-[11px] text-muted-foreground hover:text-foreground">
          {loading ? '...' : '↻'}
        </button>
      </div>
      <div className="space-y-3">
        <MiniBar
          pct={sys.cpu.used_pct}
          color="#3b82f6"
          label="CPU"
          detail={`${sys.cpu.cores} cores`}
        />
        <MiniBar
          pct={sys.memory.used_pct}
          color="#a855f7"
          label="Memory"
          detail={`${sys.memory.used_mb} / ${sys.memory.total_mb} MB`}
        />
        <MiniBar
          pct={sys.disk.used_pct}
          color="#f59e0b"
          label="Disk"
          detail={`${sys.disk.used_gb} / ${sys.disk.total_gb} GB`}
        />
      </div>
    </div>
  );
}
