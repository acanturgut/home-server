import { useEffect } from 'react';
import {
  Activity,
  ChevronLeft,
  ExternalLink,
  Hexagon,
  Info,
  Power,
  RefreshCw,
  Wrench,
  X,
} from 'lucide-react';
import { API_BASE } from '@/lib/api';
import { formatUptime } from '@/lib/format';
import { ENDPOINTS } from '@/lib/endpoints';
import { EndpointCard } from '@/features/settings/components/EndpointCard';
import { SmartHomeSettings } from '@/features/home';
import { ApiTokensTab } from '@/features/settings/ApiTokensTab';
import { RouterSettingsTab } from '@/features/router';
import { DNSSettingsTab } from '@/features/dns';
import { UsersSettingsTab } from '@/features/auth';
import {
  SettingsCard,
  SkeletonRows,
  InfoRow,
  NumberRow,
} from '@/components/ui/settings-rows';
import { NodeFormInline } from '@/features/settings/components/NodeFormInline';
import { useSettings } from '@/features/settings/hooks/useSettings';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useRoute, pushRoute, useIsMobile } from '@/app/routing';

type SettingsTabId =
  | 'general'
  | 'nodes'
  | 'home'
  | 'router'
  | 'dns'
  | 'users'
  | 'tokens'
  | 'api';

const VALID_TABS: SettingsTabId[] = [
  'general',
  'nodes',
  'home',
  'router',
  'dns',
  'users',
  'tokens',
  'api',
];

/* ── Settings Panel (Config + Node CRUD) ── */
export function SettingsPanel() {
  const route = useRoute();
  const isMobile = useIsMobile();

  // Sub-route drives the active tab. On mobile a missing sub means "show the
  // master list"; on desktop we fall back to General so the body is never
  // blank when the user lands on /settings.
  const urlTab = (
    route.sub && (VALID_TABS as string[]).includes(route.sub)
      ? (route.sub as SettingsTabId)
      : undefined
  );
  const tab: SettingsTabId = urlTab ?? 'general';
  const setTab = (next: SettingsTabId) => pushRoute('settings', next);
  const showMaster = !isMobile || !urlTab;
  const showDetail = !isMobile || !!urlTab;

  // Legacy `settings:set-tab` listener kept for any code paths that haven't
  // migrated to the URL-based gotoPage helper yet.
  useEffect(() => {
    const onSetTab = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tab?: string } | undefined;
      if (detail?.tab && (VALID_TABS as string[]).includes(detail.tab)) {
        pushRoute('settings', detail.tab);
      }
    };
    window.addEventListener('settings:set-tab', onSetTab as EventListener);
    return () =>
      window.removeEventListener('settings:set-tab', onSetTab as EventListener);
  }, []);

  const {
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
    settings,
    settingsDirty,
    settingsSaving,
    settingsLoading,
    updateSetting,
    saveSettings,
    resetSettings,
    refreshSettings,
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
  } = useSettings();

  const tabs: Array<{
    id: SettingsTabId;
    label: string;
    description: string;
    group: 'system' | 'network' | 'ai' | 'devices';
  }> = [
    {
      id: 'general',
      label: 'General',
      description: 'Version, defaults, system info',
      group: 'system',
    },
    {
      id: 'users',
      label: 'Users & Access',
      description: 'Login accounts and roles',
      group: 'system',
    },
    {
      id: 'api',
      label: 'API',
      description: 'HTTP endpoint reference',
      group: 'system',
    },

    {
      id: 'router',
      label: 'Router',
      description: 'ASUS router credentials',
      group: 'network',
    },
    {
      id: 'dns',
      label: 'DNS / Ad-blocker',
      description: 'Local records, blocklists, allowlists',
      group: 'network',
    },

    {
      id: 'nodes',
      label: `Nodes (${nodes.length})`,
      description: 'Inference workers and their models',
      group: 'ai',
    },

    {
      id: 'home',
      label: 'Smart Home',
      description: 'Bridges and devices',
      group: 'devices',
    },
    {
      id: 'tokens',
      label: 'API Tokens',
      description: 'Bearer tokens for Shortcuts and scripts',
      group: 'system',
    },
  ];

  const activeTab = tabs.find((t) => t.id === tab) ?? tabs[0];
  const groups: Array<{ key: string; label: string }> = [
    { key: 'system', label: 'System' },
    { key: 'network', label: 'Network' },
    { key: 'ai', label: 'AI' },
    { key: 'devices', label: 'Devices' },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 max-w-6xl">
      {/* ── Settings nav (vertical grouped list, like iOS Settings) ── */}
      {showMaster && (
        <aside className="w-full lg:w-64 shrink-0 space-y-5 lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
          {groups.map((g) => (
            <div key={g.key} className="space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 px-1">
                {g.label}
              </div>
              <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden divide-y divide-border/30">
                {tabs
                  .filter((t) => t.group === g.key)
                  .map((t) => {
                    const isActive = !isMobile && t.id === tab;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`w-full text-left px-3 py-2.5 transition-colors ${
                          isActive
                            ? 'bg-primary/10 text-foreground'
                            : 'text-foreground/85 hover:bg-white/5'
                        }`}>
                        <div className="text-sm font-medium">{t.label}</div>
                        <div className="text-xs text-muted-foreground/75 mt-0.5">
                          {t.description}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </aside>
      )}

      {/* ── Active tab body ── */}
      {showDetail && (
        <div className="flex-1 min-w-0 space-y-5">
          <header className="space-y-1">
            {isMobile && (
              <button
                onClick={() => pushRoute('settings')}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground/80 hover:text-foreground transition-colors -ml-1">
                <ChevronLeft size={14} />
                Settings
              </button>
            )}
            <h2 className="text-lg font-semibold text-foreground">
              {activeTab.label}
            </h2>
            <p className="text-sm text-muted-foreground/80">
              {activeTab.description}
            </p>
          </header>

      {/* ── General Tab ── */}
      {tab === 'general' && (
        <div className="space-y-4">
          {/* Top action bar */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground/60">
              {loading
                ? 'Loading…'
                : sysCfg
                  ? `home-server ${sysCfg.version} · uptime ${formatUptime(sysCfg.uptime_seconds)}`
                  : 'Configuration'}
            </p>
            <button
              onClick={() => {
                refresh();
                refreshSettings();
              }}
              disabled={loading || settingsLoading}
              className="text-xs flex items-center gap-1 px-2 py-1 text-muted-foreground/70 hover:text-foreground/80 disabled:opacity-30 transition-colors">
              <RefreshCw
                size={10}
                className={loading || settingsLoading ? 'animate-spin' : ''}
              />
              Refresh
            </button>
          </div>

          {loadError && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
              {loadError}
            </div>
          )}

          {/* ── System Info card ── */}
          <SettingsCard title="System" icon={<Hexagon size={12} />}>
            {loading || !sysCfg ? (
              <SkeletonRows rows={5} />
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <InfoRow label="Version" value={sysCfg.version} />
                <InfoRow label="Port" value={sysCfg.port} mono />
                <InfoRow
                  label="Started"
                  value={new Date(sysCfg.started_at).toLocaleString()}
                />
                <InfoRow
                  label="Uptime"
                  value={formatUptime(sysCfg.uptime_seconds)}
                />
                <InfoRow label="Nodes" value={String(sysCfg.nodes_count)} />
                <InfoRow label="Data dir" value={sysCfg.data_dir} mono full />
                <InfoRow label="Log dir" value={sysCfg.log_dir} mono full />
                <InfoRow label="HomeKit PIN" value={sysCfg.homekit_pin} mono />
              </div>
            )}
          </SettingsCard>

          {/* ── Backends card ── */}
          <SettingsCard title="Backends" icon={<Activity size={12} />}>
            {loading ? (
              <SkeletonRows rows={2} />
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span
                    className={`w-2 h-2 rounded-full ${ollamaOnline ? 'bg-emerald-500' : 'bg-zinc-500'}`}
                  />
                  <span className="text-sm font-medium">Ollama</span>
                  <span className="text-xs text-muted-foreground">
                    {ollamaOnline ? 'Online' : 'Offline'}
                  </span>
                  <span className="text-xs text-muted-foreground/70 ml-auto font-mono">
                    {ollamaHost}
                  </span>
                </div>
                <div className="space-y-1.5 pt-3 border-t border-border/10">
                  <label className="text-xs text-muted-foreground">
                    Router Model (Ollama classifier)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      inputSize="sm"
                      value={routerModel}
                      onChange={(e) => setRouterModel(e.target.value)}
                      placeholder="gemma3:1b"
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={saveConfig}
                      disabled={saving}>
                      {saving ? '...' : 'Save'}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </SettingsCard>

          {/* ── Defaults card ── */}
          <SettingsCard
            title="Defaults"
            icon={<Wrench size={12} />}
            actions={
              <>
                {settingsDirty && (
                  <span className="text-xs text-amber-400/80">unsaved</span>
                )}
                <button
                  onClick={resetSettings}
                  disabled={settingsSaving}
                  className="text-xs text-muted-foreground/70 hover:text-foreground transition-colors">
                  Reset
                </button>
                <button
                  onClick={saveSettings}
                  disabled={!settingsDirty || settingsSaving}
                  className="text-xs px-2 py-0.5 rounded bg-foreground/10 hover:bg-foreground/15 disabled:opacity-30 transition-colors">
                  {settingsSaving ? '…' : 'Save'}
                </button>
              </>
            }>
            {settingsLoading ? (
              <SkeletonRows rows={1} />
            ) : (
              <div className="space-y-3">
                <NumberRow
                  label="Default temperature"
                  hint="Used as the LLM temperature default for new nodes (0.0–2.0)"
                  value={settings.defaultTemperature}
                  step={0.1}
                  min={0}
                  max={2}
                  onChange={(v) => updateSetting('defaultTemperature', v)}
                />
              </div>
            )}
          </SettingsCard>

          {/* ── About card ── */}
          <SettingsCard title="About" icon={<Info size={12} />}>
            <div className="space-y-2 text-xs text-muted-foreground/70">
              <p>
                <span className="text-foreground/80">home-server</span> — a
                self-hosted dashboard for your network, smart home, and AI
                nodes, running on your Raspberry Pi.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <a
                  href="https://github.com/acanturgut/home-server"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-400/80 hover:text-blue-300 inline-flex items-center gap-1">
                  <ExternalLink size={9} /> GitHub
                </a>
                <a
                  href={`${API_BASE}/api/health`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-400/80 hover:text-blue-300 inline-flex items-center gap-1">
                  <ExternalLink size={9} /> /api/health
                </a>
                <a
                  href={`${API_BASE}/api/system`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-400/80 hover:text-blue-300 inline-flex items-center gap-1">
                  <ExternalLink size={9} /> /api/system
                </a>
              </div>
            </div>
          </SettingsCard>
        </div>
      )}

      {/* ── Nodes Tab ── */}
      {tab === 'nodes' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {loading
                ? 'Loading nodes…'
                : `${nodes.length} node${nodes.length !== 1 ? 's' : ''} configured`}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={refresh}
                disabled={loading}
                className="text-xs flex items-center gap-1 px-2 py-1 text-muted-foreground/70 hover:text-foreground/80 disabled:opacity-30 transition-colors">
                <RefreshCw
                  size={10}
                  className={loading ? 'animate-spin' : ''}
                />
                Refresh
              </button>
              <button
                onClick={() => {
                  setShowAdd(!showAdd);
                  setEditId(null);
                  setForm({
                    name: '',
                    host: '',
                    tier: 'high-end',
                    gpu: '',
                    mac: '',
                    model: '',
                    temperature: settings.defaultTemperature,
                  });
                }}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                {showAdd ? (
                  <>
                    <X size={11} className="inline" /> Cancel
                  </>
                ) : (
                  '+ Add Node'
                )}
              </button>
            </div>
          </div>

          {loading && nodes.length === 0 && <SkeletonRows rows={3} block />}

          {showAdd && (
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
              <p className="text-xs font-medium text-foreground/70">
                New Node
              </p>
              <NodeFormInline form={form} setForm={setForm} models={models} />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowAdd(false)}
                  className="px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
                <button
                  onClick={addNode}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-foreground/10 hover:bg-foreground/15 transition-colors">
                  Add
                </button>
              </div>
            </div>
          )}

          {nodes.map((n) => (
            <div
              key={n.id}
              className="rounded-lg border border-border/30 p-3 space-y-2">
              <div className="flex items-center gap-3">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${n.online ? 'bg-emerald-500' : 'bg-zinc-500'}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{n.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {n.tier}
                    </span>
                    {n.gpu && (
                      <span className="text-xs text-muted-foreground">
                        {n.gpu}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">
                    {n.host}
                    {n.model ? ` · ${n.model}` : ''}
                    {n.temperature != null ? ` · t=${n.temperature}` : ''}
                    {n.mac ? ` · ${n.mac}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {n.mac && (
                    <button
                      onClick={() => wakeNode(n.id)}
                      className="px-2 py-1 rounded text-xs text-violet-400 hover:bg-violet-500/10 transition-colors">
                      <Power size={13} />
                    </button>
                  )}
                  <button
                    onClick={() =>
                      editId === n.id ? setEditId(null) : startEdit(n)
                    }
                    className={`px-2 py-1 rounded text-xs transition-colors ${editId === n.id ? 'text-blue-300 bg-blue-500/10' : 'text-muted-foreground hover:text-foreground'}`}>
                    {editId === n.id ? 'Close' : 'Edit'}
                  </button>
                  <button
                    onClick={() => removeNode(n.id)}
                    className="px-2 py-1 rounded text-xs text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                    <X size={13} />
                  </button>
                </div>
              </div>
              {editId === n.id && (
                <div className="pt-2 border-t border-border/20 space-y-3">
                  <NodeFormInline
                    form={form}
                    setForm={setForm}
                    models={models}
                    nodeId={n.id}
                    online={n.online}
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditId(null)}
                      className="px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={saveNode}
                      className="px-2.5 py-1 rounded-md text-xs font-medium bg-foreground/10 hover:bg-foreground/15 transition-colors">
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!loading && nodes.length === 0 && !showAdd && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No nodes configured
            </p>
          )}
        </div>
      )}

      {/* ── Smart Home Tab (HomeKit + bridges) ── */}
      {tab === 'home' && <SmartHomeSettings />}
      {tab === 'tokens' && <ApiTokensTab />}
      {tab === 'router' && <RouterSettingsTab />}
      {tab === 'dns' && <DNSSettingsTab />}
      {tab === 'users' && <UsersSettingsTab />}

      {/* ── API Tab ── */}
      {tab === 'api' && (
        <div className="space-y-6">
          {Array.from(
            ENDPOINTS.reduce((acc, ep) => {
              const key = ep.group ?? 'Other';
              const list = acc.get(key) ?? [];
              list.push(ep);
              acc.set(key, list);
              return acc;
            }, new Map<string, typeof ENDPOINTS>()).entries(),
          ).map(([group, eps]) => (
            <section key={group} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </h3>
                <span className="text-xs text-muted-foreground/60">
                  {eps.length}
                </span>
                <div className="ml-2 h-px flex-1 bg-border/40" />
              </div>
              <div className="space-y-3">
                {eps.map((ep) => (
                  <EndpointCard key={`${ep.method}-${ep.path}`} ep={ep} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
        </div>
      )}
    </div>
  );
}
