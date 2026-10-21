import { useCallback, useEffect, useState } from 'react';
import { settingsApi, type SystemConfigDTO } from '@/features/settings/api';
import { useAction } from '@/hooks/useAction';

/**
 * Server config (GET /api/config) plus Ollama reachability from /api/health.
 * Config renders as soon as it arrives; health pings every node and can take
 * seconds, so `ollamaOnline` stays null ("checking") until it answers.
 */
export function useSystemConfig() {
  const [config, setConfig] = useState<SystemConfigDTO | null>(null);
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);

  const fetchConfig = useCallback(async () => {
    setOllamaOnline(null);
    const health = settingsApi.getHealth();
    setConfig(await settingsApi.getConfig());
    setOllamaOnline(!!(await health).backends?.ollama);
  }, []);
  const { run: refresh, busy, error } = useAction(fetchConfig);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Throws on failure so the caller can show it next to the field. */
  const saveRouterModel = useCallback(async (router_model: string) => {
    const saved = await settingsApi.putConfig({ router_model });
    setConfig((c) => c && { ...c, router_model: saved.router_model });
  }, []);

  return {
    config,
    ollamaOnline,
    loading: !config && !error,
    busy,
    error,
    refresh,
    saveRouterModel,
  };
}
