import { useCallback, useEffect, useState } from 'react';
import {
  settingsApi,
  type NodeConfig,
  type SystemConfigDTO,
} from '@/features/settings/api';

type RuntimeSettings = {
  defaultTemperature: number;
};

const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  defaultTemperature: 0.7,
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
 * and node CRUD. The panel component is purely presentational.
 */
export function useSettings() {
  // --- system config + health ---
  const [routerModel, setRouterModel] = useState('');
  const [ollamaHost, setOllamaHost] = useState('');
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sysCfg, setSysCfg] = useState<SystemConfigDTO | null>(null);

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

  /* config / health */
  // `load*` only set state from promise callbacks, so the mount effect can
  // call them directly; `refresh*` also flip the loading flags first.
  const loadConfig = useCallback(
    () =>
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
        .finally(() => setLoading(false)),
    [],
  );

  const refresh = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    void loadConfig();
  }, [loadConfig]);

  /* runtime settings */
  const loadSettings = useCallback(
    () =>
      settingsApi
        .getSettings()
        .then((d) => {
          if (d) {
            setSettings({ ...DEFAULT_RUNTIME_SETTINGS, ...d });
            setSettingsDirty(false);
          }
        })
        .finally(() => setSettingsLoading(false)),
    [],
  );

  const refreshSettings = useCallback(() => {
    setSettingsLoading(true);
    void loadSettings();
  }, [loadSettings]);

  // Initial state already has loading flags on and no error.
  useEffect(() => {
    void loadConfig();
    void loadSettings();
  }, [loadConfig, loadSettings]);

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
