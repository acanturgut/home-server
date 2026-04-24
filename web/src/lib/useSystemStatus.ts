import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';
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
      fetch(`${API_BASE}/api/system`)
        .then((r) => r.json())
        .then(setSys)
        .catch(() => {});
      fetch(`${API_BASE}/api/nodes/stats`)
        .then((r) => r.json())
        .then((s) => setNodeCount(Object.keys(s || {}).length))
        .catch(() => {});
      fetch(`${API_BASE}/api/apps`)
        .then((r) => r.json())
        .then((a) => setAppCount(Array.isArray(a) ? a.length : 0))
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return { sys, nodeCount, appCount };
}
