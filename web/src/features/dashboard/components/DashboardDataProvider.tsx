import { useState, type ReactNode } from 'react';
import { dashboardApi } from '@/features/dashboard/api';
import {
  DashboardDataContext,
  EMPTY_DASHBOARD_DATA,
  type DashboardData,
} from '@/features/dashboard/hooks/useDashboardData';
import { usePolling } from '@/hooks/usePolling';
import { nodesApi } from '@/lib/nodes';

const FAST_INTERVAL_MS = 4000;
const SLOW_INTERVAL_MS = 30000;

/**
 * Shared data for a dashboard page: one fan-out tick instead of a poller
 * per card, fetching only what the page asks for (pauses while hidden).
 *  - `logs`:    last 500 log entries, every 4s (AI page)
 *  - `cluster`: node stats + host history every 4s, node list every 30s
 */
export function DashboardDataProvider({
  logs = false,
  cluster = false,
  children,
}: {
  logs?: boolean;
  cluster?: boolean;
  children: ReactNode;
}) {
  const [data, setData] = useState<DashboardData>(EMPTY_DASHBOARD_DATA);

  usePolling(async () => {
    const [logRows, nodeStats, systemHistory] = await Promise.all([
      logs ? dashboardApi.logs(500) : null,
      cluster ? nodesApi.stats() : null,
      cluster ? dashboardApi.systemHistory() : null,
    ]);
    setData((prev) => ({
      ...prev,
      logs: logRows ?? prev.logs,
      nodeStats: nodeStats ?? prev.nodeStats,
      systemHistory: systemHistory ?? prev.systemHistory,
      lastTick: Date.now(),
      ready: true,
    }));
  }, FAST_INTERVAL_MS);

  usePolling(async () => {
    if (!cluster) return;
    const nodes = await dashboardApi.nodes();
    if (nodes) setData((prev) => ({ ...prev, nodes }));
  }, SLOW_INTERVAL_MS);

  return (
    <DashboardDataContext.Provider value={data}>
      {children}
    </DashboardDataContext.Provider>
  );
}
