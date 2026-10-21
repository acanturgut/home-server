import { useEffect, useState } from 'react';
import { settingsApi, type RuntimeSettings } from '@/features/settings/api';
import { useAction } from '@/hooks/useAction';
import { useConfirm } from '@/hooks/useConfirm';

const DEFAULTS: RuntimeSettings = { defaultTemperature: 0.7 };

/** Editable runtime settings (/api/settings) with a local draft. */
export function useRuntimeSettings() {
  const confirm = useConfirm();
  const [settings, setSettings] = useState<RuntimeSettings | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void settingsApi
      .getSettings()
      .then((s) => setSettings({ ...DEFAULTS, ...s }));
  }, []);

  const apply = (next: RuntimeSettings) => {
    setSettings({ ...DEFAULTS, ...next });
    setDirty(false);
    return true;
  };

  const update = (patch: Partial<RuntimeSettings>) => {
    setSettings((s) => ({ ...DEFAULTS, ...s, ...patch }));
    setDirty(true);
  };

  const save = useAction(async () =>
    apply(await settingsApi.putSettings(settings ?? DEFAULTS)),
  );
  const resetAction = useAction(async () =>
    apply(await settingsApi.resetSettings()),
  );

  /** Resolves true once the server has reset (router model included). */
  const reset = async () => {
    const ok = await confirm({
      title: 'Reset runtime settings?',
      body: 'Every runtime setting, including the router model, goes back to its default.',
      confirmLabel: 'Reset',
      destructive: true,
    });
    return ok && (await resetAction.run()) === true;
  };

  return {
    settings,
    dirty,
    update,
    save: save.run,
    reset,
    busy: save.busy || resetAction.busy,
    error: save.error ?? resetAction.error,
  };
}
