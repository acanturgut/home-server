import { useState } from 'react';
import { toast } from '@/components/ui/toast';
import { useConfirm, type ConfirmOptions } from '@/hooks/useConfirm';
import { routerApi } from '@/features/network/api';
import { errorMessage } from '@/lib/format';

type RouterAction = 'reboot' | 'wifi';

/**
 * Router-wide actions (reboot, restart Wi-Fi). Each asks for confirmation
 * and reports the outcome as a toast. `busy` names the running action.
 */
export function useRouterActions() {
  const confirm = useConfirm();
  const [busy, setBusy] = useState<RouterAction | null>(null);

  const run = async (
    action: RouterAction,
    ask: ConfirmOptions,
    call: () => Promise<unknown>,
    done: string,
  ) => {
    if (!(await confirm(ask))) return;
    setBusy(action);
    try {
      await call();
      toast(done, { tone: 'success' });
    } catch (e) {
      toast(`${ask.confirmLabel} failed`, {
        tone: 'error',
        description: errorMessage(e),
      });
    } finally {
      setBusy(null);
    }
  };

  return {
    busy,
    reboot: () =>
      run(
        'reboot',
        {
          title: 'Reboot the router?',
          body: 'The whole network drops for about a minute.',
          confirmLabel: 'Reboot',
          destructive: true,
        },
        routerApi.reboot,
        'Router is rebooting',
      ),
    restartWifi: () =>
      run(
        'wifi',
        {
          title: 'Restart Wi-Fi?',
          body: 'Wireless devices disconnect for a few seconds.',
          confirmLabel: 'Restart Wi-Fi',
        },
        routerApi.restartWireless,
        'Wi-Fi is restarting',
      ),
  };
}
