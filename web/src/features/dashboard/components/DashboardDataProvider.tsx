import { useEffect, useState, type ReactNode } from 'react';
import { dashboardApi } from '@/features/dashboard/api';
import {
  DashboardDataContext,
  EMPTY_DASHBOARD_DATA,
  type DashboardData,
} from '@/features/dashboard/hooks/useDashboardData';
import type { NodeStats } from '@/lib/types';

/**
 * Single shared data provider for the dashboard. Replaces 5+ independent
 * pollers with one fan-out tick.
 *
 * Polling cadence:
 *  - logs(500) + nodeStats + systemHistory: every 4s
 *  - nodes (rarely changes):                       every 30s
 */
const FAST_INTERVAL_MS = 4000;
const SLOW_INTERVAL_MS = 30000;

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardData>(EMPTY_DASHBOARD_DATA);

  useEffect(() => {
    let alive = true;
    let fastTimer: ReturnType<typeof setInterval> | null = null;
    let slowTimer: ReturnType<typeof setInterval> | null = null;

    const fast = async () => {
      const [logs, nodeStats, sysHist] = await Promise.all([
        dashboardApi.logs(500),
        dashboardApi.nodeStats(),
        dashboardApi.systemHistory(),
      ]);
      if (!alive) return;
      setData((prev) => ({
        ...prev,
        logs: Array.isArray(logs) ? logs : prev.logs,
        nodeStats:
          nodeStats &&
          typeof nodeStats === 'object' &&
          !Array.isArray(nodeStats)
            ? (nodeStats as Record<string, NodeStats>)
            : prev.nodeStats,
        systemHistory: Array.isArray(sysHist) ? sysHist : prev.systemHistory,
        lastTick: Date.now(),
        ready: true,
      }));
    };
    const slow = async () => {
      const nodes = await dashboardApi.nodes();
      if (!alive) return;
      setData((prev) => ({
        ...prev,
        nodes: Array.isArray(nodes) ? nodes : prev.nodes,
      }));
    };

    fast();
    slow();
    fastTimer = setInterval(fast, FAST_INTERVAL_MS);
    slowTimer = setInterval(slow, SLOW_INTERVAL_MS);

    // Pause polling when tab is hidden — saves CPU and avoids stale bursts.
    const onVisibility = () => {
      if (document.hidden) {
        if (fastTimer) clearInterval(fastTimer);
        if (slowTimer) clearInterval(slowTimer);
        fastTimer = null;
        slowTimer = null;
      } else if (!fastTimer) {
        fast();
        slow();
        fastTimer = setInterval(fast, FAST_INTERVAL_MS);
        slowTimer = setInterval(slow, SLOW_INTERVAL_MS);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisibility);
      if (fastTimer) clearInterval(fastTimer);
      if (slowTimer) clearInterval(slowTimer);
    };
  }, []);

  return (
    <DashboardDataContext.Provider value={data}>
      {children}
    </DashboardDataContext.Provider>
  );
}
