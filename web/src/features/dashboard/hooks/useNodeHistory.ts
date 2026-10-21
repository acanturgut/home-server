import { useState } from 'react';
import type { NodeStats } from '@/lib/nodes';

const HISTORY_LEN = 30;

export interface NodeHistory {
  cpu: number[];
  mem: number[];
  gpu: number[];
}

const push = (xs: number[] | undefined, v: number | undefined) =>
  [...(xs ?? []), v ?? 0].slice(-HISTORY_LEN);

/**
 * Rolling per-node CPU / memory / GPU history, one sample per shared
 * dashboard tick (the stats endpoint only reports the current value).
 */
export function useNodeHistory(
  stats: Record<string, NodeStats>,
  tick: number,
): Record<string, NodeHistory> {
  const [hist, setHist] = useState<{
    tick: number;
    byId: Record<string, NodeHistory>;
  }>({ tick: 0, byId: {} });
  // Adjust state during render: append once per new tick.
  if (tick && tick !== hist.tick) {
    const byId: Record<string, NodeHistory> = {};
    for (const [id, s] of Object.entries(stats)) {
      const h = hist.byId[id];
      byId[id] = {
        cpu: push(h?.cpu, s.cpu_usage),
        mem: push(h?.mem, s.mem_pct),
        gpu: push(h?.gpu, s.gpu_usage),
      };
    }
    setHist({ tick, byId });
  }
  return hist.byId;
}
