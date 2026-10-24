import { useState } from 'react';
import { Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import {
  OfflineNodeCard,
  OnlineNodeCard,
} from '@/features/dashboard/components/NodeCard';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';
import { useNodeHistory } from '@/features/dashboard/hooks/useNodeHistory';
import { useConfirm } from '@/hooks/useConfirm';
import { errorMessage } from '@/lib/format';
import { nodesApi } from '@/lib/nodes';
import { gotoPage } from '@/lib/routing';

/** A node counts as online when it reported within 30s of the last poll. */
const ONLINE_WINDOW_MS = 30_000;

/** Every known node: configured ones in config order, then any that report unconfigured. */
export function ClusterNodes() {
  const { nodeStats, nodes, lastTick, ready } = useDashboardData();
  const history = useNodeHistory(nodeStats, lastTick);
  const confirm = useConfirm();
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const ids = [
    ...new Set([...nodes.map((n) => n.id), ...Object.keys(nodeStats)]),
  ];

  if (ids.length === 0) {
    return ready ? (
      <EmptyState
        icon={<Server />}
        title="No cluster nodes"
        description="Add an inference worker in Settings."
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => gotoPage('settings', { tab: 'nodes' })}
          >
            Open node settings
          </Button>
        }
      />
    ) : (
      <SkeletonRows rows={3} block />
    );
  }

  /** Wake (offline) or shut down (online); one busy flag per node. */
  const power = async (id: string, name: string, online: boolean) => {
    if (online) {
      const ok = await confirm({
        title: `Shut down ${name}?`,
        body: 'It stays off until you wake it again.',
        confirmLabel: 'Shut down',
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      if (online) {
        await nodesApi.shutdown(id);
        toast(`Shutdown queued for ${name}`, {
          description: 'The node agent runs it on its next check-in.',
        });
      } else {
        await nodesApi.wake(id);
        toast(`Wake-on-LAN sent to ${name}`, { tone: 'success' });
      }
    } catch (e) {
      toast(online ? 'Shutdown failed' : 'Wake failed', {
        tone: 'error',
        description: errorMessage(e),
      });
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  return (
    <div className="space-y-3">
      {ids.map((id) => {
        const s = nodeStats[id];
        const name = s?.hostname || nodes.find((n) => n.id === id)?.name || id;
        const online =
          !!s && lastTick - Date.parse(s.last_seen) < ONLINE_WINDOW_MS;
        // Only configured nodes can be powered on or off.
        const configured = nodes.some((n) => n.id === id);
        const ctl = configured
          ? { busy: !!busy[id], onClick: () => power(id, name, online) }
          : undefined;
        return online ? (
          <OnlineNodeCard
            key={id}
            id={id}
            name={name}
            stats={s}
            history={history[id]}
            power={ctl}
            configured={configured}
          />
        ) : (
          <OfflineNodeCard key={id} name={name} stats={s} power={ctl} />
        );
      })}
    </div>
  );
}
