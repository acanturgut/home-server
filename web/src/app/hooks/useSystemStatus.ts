import { useEffect, useState } from 'react';
import { appApi } from '@/app/api';
import type { SystemInfo } from '@/lib/types';

export interface SystemStatus {
  sys: SystemInfo | null;
  nodeCount: number;
  appCount: number;
}

/** Polls /api/system, /api/nodes/stats and /api/apps every 8s. */
export function useSystemStatus(intervalMs = 8000): SystemStatus {
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [appCount, setAppCount] = useState(0);

  useEffect(() => {
    const poll = () => {
      appApi.getSystem().then((s) => s && setSys(s));
      appApi
        .getNodesStats()
        .then((s) => setNodeCount(Object.keys(s || {}).length));
      appApi
        .listApps()
        .then((a) => setAppCount(Array.isArray(a) ? a.length : 0));
    };
    poll();
    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return { sys, nodeCount, appCount };
}
