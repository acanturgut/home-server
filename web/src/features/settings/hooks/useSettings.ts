import { useCallback, useEffect, useState } from 'react';
import type { NodeConfig } from '@/features/settings/components/NodeFormInline';
import { settingsApi, type SystemConfigDTO } from '@/features/settings/api';

export type SystemConfig = SystemConfigDTO;

export type RuntimeSettings = {
  autoFixOnCrash: boolean;
  defaultTemperature: number;
  buildTimeoutMin: number;
  keepBuildHistory: number;
};

export const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  autoFixOnCrash: false,
  defaultTemperature: 0.7,
  buildTimeoutMin: 30,
  keepBuildHistory: 20,
};

export interface NodeForm {
  name: string;
  host: string;
  tier: string;
  gpu: string;
  mac: string;
  model: string;
  temperature: number;
}

const EMPTY_FORM: NodeForm = {
  name: '',
  host: '',
  tier: 'high-end',
  gpu: '',
  mac: '',
  model: '',
  temperature: 0.7,
};

/**
 * Settings page state + side-effects: system config, runtime settings,
 * prompts, and node CRUD. The panel component is purely presentational.
 */
export function useSettings() {
  // --- system config + health ---
  const [routerModel, setRouterModel] = useState('');
  const [ollamaHost, setOllamaHost] = useState('');
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sysCfg, setSysCfg] = useState<SystemConfig | null>(null);

  // --- runtime settings ---
  const [settings, setSettings] = useState<RuntimeSettings>(
    DEFAULT_RUNTIME_SETTINGS,
  );
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);

  // --- nodes ---
  const [nodes, setNodes] = useState<NodeConfig[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<NodeForm>(EMPTY_FORM);
  const [models, setModels] = useState<string[]>([]);

  // --- prompts ---
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [promptsSaving, setPromptsSaving] = useState(false);
  const [promptsDirty, setPromptsDirty] = useState(false);

  /* prompts */
  const refreshPrompts = useCallback(async () => {
    const d = await settingsApi.getPrompts();
    if (d) {
      setPrompts(d);
      setPromptsDirty(false);
    }
  }, []);

  const savePrompts = useCallback(async () => {
    setPromptsSaving(true);
    try {
      const d = await settingsApi.putPrompts(prompts);
      setPrompts(d);
      setPromptsDirty(false);
    } catch {
      /* ignore */
    }
    setPromptsSaving(false);
  }, [prompts]);

  const resetPrompts = useCallback(async () => {
    if (!confirm('Reset all prompts to defaults?')) return;
    setPromptsSaving(true);
    try {
      const d = await settingsApi.resetPrompts();
      setPrompts(d);
      setPromptsDirty(false);
    } catch {
      /* ignore */
    }
    setPromptsSaving(false);
  }, []);

  const updatePrompt = useCallback((key: string, val: string) => {
    setPrompts((prev) => ({ ...prev, [key]: val }));
    setPromptsDirty(true);
  }, []);

  /* config / health */
  const refresh = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([settingsApi.getConfig(), settingsApi.getHealth()])
      .then(([cfg, health]) => {
        setSysCfg(cfg);
        setRouterModel(cfg.router_model || '');
        setOllamaHost(cfg.ollama_host || '');
        setOllamaOnline(health.backends?.ollama || false);
        setNodes((health.backends?.nodes || []).map((n) => ({ ...n })));
      })
      .catch((e) =>
        setLoadError(e instanceof Error ? e.message : 'Failed to load'),
      )
      .finally(() => setLoading(false));
  }, []);

  /* runtime settings */
  const refreshSettings = useCallback(() => {
    setSettingsLoading(true);
    settingsApi
      .getSettings()
      .then((d) => {
        if (d) {
          setSettings({ ...DEFAULT_RUNTIME_SETTINGS, ...d });
          setSettingsDirty(false);
        }
      })
      .finally(() => setSettingsLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    refreshSettings();
  }, [refresh, refreshSettings]);

  const updateSetting = useCallback(
    <K extends keyof RuntimeSettings>(k: K, v: RuntimeSettings[K]) => {
      setSettings((prev) => ({ ...prev, [k]: v }));
      setSettingsDirty(true);
    },
    [],
  );

  const saveSettings = useCallback(async () => {
    setSettingsSaving(true);
    try {
      const d = await settingsApi.putSettings(settings);
      setSettings({ ...DEFAULT_RUNTIME_SETTINGS, ...d });
      setSettingsDirty(false);
    } catch {
      /* ignore */
    }
    setSettingsSaving(false);
  }, [settings]);

  const resetSettings = useCallback(async () => {
    if (!confirm('Reset all runtime settings to defaults?')) return;
    setSettingsSaving(true);
    try {
      const d = await settingsApi.resetSettings();
      setSettings({ ...DEFAULT_RUNTIME_SETTINGS, ...d });
      setSettingsDirty(false);
    } catch {
      /* ignore */
    }
    setSettingsSaving(false);
  }, []);

  const saveConfig = useCallback(async () => {
    setSaving(true);
    try {
      const data = await settingsApi.putConfig({ router_model: routerModel });
      setRouterModel(data.router_model);
    } catch {
      /* ignore */
    }
    setSaving(false);
  }, [routerModel]);

  /* nodes */
  const startEdit = useCallback((n: NodeConfig) => {
    setEditId(n.id);
    setForm({
      name: n.name,
      host: n.host,
      tier: n.tier,
      gpu: n.gpu || '',
      mac: n.mac || '',
      model: n.model || '',
      temperature: n.temperature ?? 0.7,
    });
    setModels([]);
    if (n.online) {
      settingsApi.getNodeModels(n.id).then((d) => setModels(d?.models || []));
    }
  }, []);

  const saveNode = useCallback(async () => {
    if (!editId) return;
    await settingsApi.updateNode(editId, form);
    setEditId(null);
    refresh();
  }, [editId, form, refresh]);

  const removeNode = useCallback(
    async (id: string) => {
      if (!confirm('Remove this node?')) return;
      await settingsApi.deleteNode(id);
      setEditId(null);
      refresh();
    },
    [refresh],
  );

  const addNode = useCallback(async () => {
    if (!form.name || !form.host) return;
    await settingsApi.addNode(form);
    setShowAdd(false);
    setForm({ ...EMPTY_FORM, temperature: settings.defaultTemperature });
    refresh();
  }, [form, settings.defaultTemperature, refresh]);

  const wakeNode = useCallback(async (id: string) => {
    await settingsApi.wakeNode(id);
  }, []);

  return {
    // system
    sysCfg,
    routerModel,
    setRouterModel,
    ollamaHost,
    ollamaOnline,
    saving,
    loading,
    loadError,
    refresh,
    saveConfig,
    // runtime
    settings,
    settingsDirty,
    settingsSaving,
    settingsLoading,
    updateSetting,
    saveSettings,
    resetSettings,
    refreshSettings,
    // prompts
    prompts,
    promptsDirty,
    promptsSaving,
    refreshPrompts,
    savePrompts,
    resetPrompts,
    updatePrompt,
    // nodes
    nodes,
    editId,
    setEditId,
    showAdd,
    setShowAdd,
    form,
    setForm,
    models,
    startEdit,
    saveNode,
    removeNode,
    addNode,
    wakeNode,
  };
}
