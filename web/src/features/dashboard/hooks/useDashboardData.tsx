import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  dashboardApi,
  type SystemHistoryPoint,
  type NodeRow,
} from '@/features/dashboard/api';
import type { AppInfo, LogEntry, NodeStats } from '@/lib/types';

/**
 * Single shared data provider for the dashboard. Replaces 5+ independent
 * pollers with one fan-out tick. Components select what they need.
 *
 * Polling cadence:
 *  - logs(500) + nodeStats + apps + systemHistory: every 4s
 *  - nodes (rarely changes):                       every 30s
 */
interface DashboardData {
  logs: LogEntry[];
  nodeStats: Record<string, NodeStats>;
  nodes: NodeRow[];
  apps: AppInfo[];
  systemHistory: SystemHistoryPoint[];
  lastTick: number;
  ready: boolean;
}

const empty: DashboardData = {
  logs: [],
  nodeStats: {},
  nodes: [],
  apps: [],
  systemHistory: [],
  lastTick: 0,
  ready: false,
};

const Ctx = createContext<DashboardData>(empty);

const FAST_INTERVAL_MS = 4000;
const SLOW_INTERVAL_MS = 30000;

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardData>(empty);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let fastTimer: ReturnType<typeof setInterval> | null = null;
    let slowTimer: ReturnType<typeof setInterval> | null = null;

    const fast = async () => {
      const [logs, nodeStats, apps, sysHist] = await Promise.all([
        dashboardApi.logs(500),
        dashboardApi.nodeStats(),
        dashboardApi.apps(),
        dashboardApi.systemHistory(),
      ]);
      if (!mounted.current) return;
      setData((prev) => ({
        ...prev,
        logs: Array.isArray(logs) ? logs : prev.logs,
        nodeStats:
          nodeStats &&
          typeof nodeStats === 'object' &&
          !Array.isArray(nodeStats)
            ? (nodeStats as Record<string, NodeStats>)
            : prev.nodeStats,
        apps: Array.isArray(apps) ? apps : prev.apps,
        systemHistory: Array.isArray(sysHist) ? sysHist : prev.systemHistory,
        lastTick: Date.now(),
        ready: true,
      }));
    };
    const slow = async () => {
      const nodes = await dashboardApi.nodes();
      if (!mounted.current) return;
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
      mounted.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      if (fastTimer) clearInterval(fastTimer);
      if (slowTimer) clearInterval(slowTimer);
    };
  }, []);

  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}

export function useDashboardData() {
  return useContext(Ctx);
}
