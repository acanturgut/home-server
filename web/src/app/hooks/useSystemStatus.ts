import { useEffect, useState } from 'react';
import { appApi } from '@/app/api';
import type { SystemInfo } from '@/lib/types';

export interface SystemStatus {
  sys: SystemInfo | null;
  nodeCount: number;
}

/** Polls /api/system and /api/nodes/stats every 8s. */
export function useSystemStatus(intervalMs = 8000): SystemStatus {
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [nodeCount, setNodeCount] = useState(0);

  useEffect(() => {
    const poll = () => {
      appApi.getSystem().then((s) => s && setSys(s));
      appApi
        .getNodesStats()
        .then((s) => setNodeCount(Object.keys(s || {}).length));
    };
    poll();
    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return { sys, nodeCount };
}
