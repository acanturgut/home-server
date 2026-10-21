import { createContext, useContext } from 'react';
import type { SystemHistoryPoint, NodeRow } from '@/features/dashboard/api';
import type { LogEntry } from '@/lib/types';
import type { NodeStats } from '@/lib/nodes';

/**
 * Shared dashboard data, filled by `DashboardDataProvider`. Components select
 * what they need via `useDashboardData()`.
 */
export interface DashboardData {
  logs: LogEntry[];
  nodeStats: Record<string, NodeStats>;
  nodes: NodeRow[];
  systemHistory: SystemHistoryPoint[];
  lastTick: number;
  ready: boolean;
}

export const EMPTY_DASHBOARD_DATA: DashboardData = {
  logs: [],
  nodeStats: {},
  nodes: [],
  systemHistory: [],
  lastTick: 0,
  ready: false,
};

export const DashboardDataContext =
  createContext<DashboardData>(EMPTY_DASHBOARD_DATA);

export function useDashboardData() {
  return useContext(DashboardDataContext);
}
