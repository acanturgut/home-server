import { useCallback, useState } from 'react';
import { toast } from '@/components/ui/toast';
import { useConfirm } from '@/hooks/useConfirm';
import { usePolling } from '@/hooks/usePolling';
import {
  deviceLabel,
  routerApi,
  type RouterClient,
  type RouterStatusResp,
} from '@/features/network/api';
import { errorMessage } from '@/lib/format';

/**
 * Router status plus its client list, polled every 30 s, and the
 * per-device actions. `clients` is null when the router isn't configured;
 * `busyMac` is the device whose action is running.
 */
export function useRouterClients() {
  const confirm = useConfirm();
  const [router, setRouter] = useState<RouterStatusResp | null>(null);
  const [clients, setClients] = useState<RouterClient[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyMac, setBusyMac] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [rt, cs] = await Promise.all([
      routerApi.status(),
      routerApi.clients(),
    ]);
    if (rt) setRouter(rt);
    setClients(cs?.configured ? cs.clients || [] : null);
    setLoading(false);
  }, []);
  usePolling(reload, 30_000);

  const patch = (mac: string, change: Partial<RouterClient>) =>
    setClients((prev) =>
      prev ? prev.map((x) => (x.mac === mac ? { ...x, ...change } : x)) : prev,
    );

  /** Runs one device action with its row busy; the result is a toast. */
  const withDevice = async (
    c: RouterClient,
    failed: string,
    call: () => Promise<string>,
  ) => {
    setBusyMac(c.mac);
    try {
      toast(await call(), { tone: 'success' });
    } catch (e) {
      toast(failed, { tone: 'error', description: errorMessage(e) });
    } finally {
      setBusyMac(null);
    }
  };

  const toggleBlock = async (c: RouterClient) => {
    const label = deviceLabel(c);
    const block = !c.blocked;
    if (
      block &&
      !(await confirm({
        title: `Block ${label}?`,
        body: 'The router cuts this device off from the internet until you unblock it.',
        confirmLabel: 'Block',
        destructive: true,
      }))
    )
      return;
    await withDevice(
      c,
      block ? "Couldn't block device" : "Couldn't unblock device",
      async () => {
        await routerApi.block(c.mac, block, label);
        patch(c.mac, { blocked: block });
        return block ? `Blocked ${label}` : `Unblocked ${label}`;
      },
    );
  };

  const wake = (c: RouterClient) =>
    withDevice(c, 'Wake-on-LAN failed', async () => {
      await routerApi.wol(c.mac);
      return `Wake-on-LAN sent to ${deviceLabel(c)}`;
    });

  /** Throws on failure so the rename dialog can show the error. */
  const rename = async (c: RouterClient, name: string) => {
    await routerApi.rename(c.mac, name);
    patch(c.mac, { custom_name: name });
    toast(name ? `Renamed to ${name}` : 'Name cleared', { tone: 'success' });
  };

  return {
    router,
    clients,
    loading,
    reload,
    busyMac,
    toggleBlock,
    wake,
    rename,
  };
}
