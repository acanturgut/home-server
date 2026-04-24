import { useState } from 'react';
import {
  Activity,
  Blocks,
  ExternalLink,
  Hexagon,
  Power,
  RefreshCw,
  Wrench,
  X,
} from 'lucide-react';
import { API_BASE } from '@/lib/api';
import { formatUptime } from '@/lib/format';
import { ENDPOINTS } from '@/lib/endpoints';
import { EndpointCard } from '@/features/settings/components/EndpointCard';
import { HomeKitPanel } from '@/features/homekit/HomeKitPanel';
import {
  SettingsCard,
  SkeletonRows,
  InfoRow,
  ToggleRow,
  NumberRow,
} from '@/features/settings/components/SettingsRows';
import { PromptsEditor } from '@/features/settings/components/PromptsEditor';
import { NodeFormInline } from '@/features/settings/components/NodeFormInline';
import { useSettings } from '@/features/settings/hooks/useSettings';

/* ── Settings Panel (Config + Node CRUD) ── */
export function SettingsPanel() {
  const [tab, setTab] = useState<
    'general' | 'nodes' | 'homekit' | 'api' | 'prompts'
  >('general');

  const {
    sysCfg, routerModel, setRouterModel, ollamaHost, ollamaOnline,
    saving, loading, loadError, refresh, saveConfig,
    settings, settingsDirty, settingsSaving, settingsLoading,
    updateSetting, saveSettings, resetSettings, refreshSettings,
    prompts, promptsDirty, promptsSaving,
    refreshPrompts, savePrompts, resetPrompts, updatePrompt,
    nodes, editId, setEditId, showAdd, setShowAdd, form, setForm, models,
    startEdit, saveNode, removeNode, addNode, wakeNode,
  } = useSettings();

  const tabs = [
    { id: 'general' as const, label: 'General' },
    { id: 'nodes' as const, label: `Nodes (${nodes.length})` },
    { id: 'prompts' as const, label: 'Prompts' },
    { id: 'homekit' as const, label: 'HomeKit' },
    { id: 'api' as const, label: 'API' },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border/20 pb-px">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors ${
              tab === t.id
                ? 'text-foreground bg-muted/30 border-b-2 border-foreground/40'
                : 'text-muted-foreground hover:text-foreground'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── General Tab ── */}
      {tab === 'general' && (
        <div className="space-y-4">
          {/* Top action bar */}
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground/60">
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
              className="text-[10px] flex items-center gap-1 px-2 py-1 text-muted-foreground/50 hover:text-foreground/80 disabled:opacity-30 transition-colors">
              <RefreshCw
                size={10}
                className={loading || settingsLoading ? 'animate-spin' : ''}
              />
              Refresh
            </button>
          </div>

          {loadError && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-[11px] text-red-300">
              {loadError}
            </div>
          )}

          {/* ── System Info card ── */}
          <SettingsCard title="System" icon={<Hexagon size={12} />}>
            {loading || !sysCfg ? (
              <SkeletonRows rows={5} />
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
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
                <InfoRow label="Apps" value={String(sysCfg.apps_count)} />
                <InfoRow label="Nodes" value={String(sysCfg.nodes_count)} />
                <InfoRow label="Data dir" value={sysCfg.data_dir} mono full />
                <InfoRow label="Log dir" value={sysCfg.log_dir} mono full />
                <InfoRow label="HomeKit PIN" value={sysCfg.homekit_pin} mono />
                <InfoRow
                  label="Anthropic key"
                  value={sysCfg.anthropic_set ? 'configured' : 'not set'}
                  valueClass={
                    sysCfg.anthropic_set
                      ? 'text-emerald-400/80'
                      : 'text-muted-foreground/50'
                  }
                />
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
                  <span className="text-[11px] text-muted-foreground">
                    {ollamaOnline ? 'Online' : 'Offline'}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50 ml-auto font-mono">
                    {ollamaHost}
                  </span>
                </div>
                <div className="space-y-1.5 pt-3 border-t border-border/10">
                  <label className="text-[11px] text-muted-foreground">
                    Router Model (Ollama classifier)
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={routerModel}
                      onChange={(e) => setRouterModel(e.target.value)}
                      placeholder="gemma3:1b"
                      className="h-7 text-xs flex-1 rounded-md border border-border/30 bg-transparent px-2 focus:outline-none focus:ring-1 focus:ring-ring/30"
                    />
                    <button
                      onClick={saveConfig}
                      disabled={saving}
                      className="h-7 px-3 rounded-md text-[11px] font-medium bg-foreground/10 hover:bg-foreground/15 disabled:opacity-50 transition-colors">
                      {saving ? '...' : 'Save'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </SettingsCard>

          {/* ── Build Defaults card ── */}
          <SettingsCard
            title="Build Defaults"
            icon={<Wrench size={12} />}
            actions={
              <>
                {settingsDirty && (
                  <span className="text-[9px] text-amber-400/80">unsaved</span>
                )}
                <button
                  onClick={resetSettings}
                  disabled={settingsSaving}
                  className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors">
                  Reset
                </button>
                <button
                  onClick={saveSettings}
                  disabled={!settingsDirty || settingsSaving}
                  className="text-[10px] px-2 py-0.5 rounded bg-foreground/10 hover:bg-foreground/15 disabled:opacity-30 transition-colors">
                  {settingsSaving ? '…' : 'Save'}
                </button>
              </>
            }>
            {settingsLoading ? (
              <SkeletonRows rows={5} />
            ) : (
              <div className="space-y-3">
                <ToggleRow
                  label="Auto-fix on crash"
                  hint="Automatically run /fix when a deployed app exits unexpectedly"
                  value={settings.autoFixOnCrash}
                  onChange={(v) => updateSetting('autoFixOnCrash', v)}
                />
                <NumberRow
                  label="Default temperature"
                  hint="Used as the LLM temperature default for new nodes (0.0–2.0)"
                  value={settings.defaultTemperature}
                  step={0.1}
                  min={0}
                  max={2}
                  onChange={(v) => updateSetting('defaultTemperature', v)}
                />
                <NumberRow
                  label="Build timeout"
                  hint="Hard cap on how long a single build pipeline run may take, in minutes"
                  value={settings.buildTimeoutMin}
                  step={1}
                  min={1}
                  max={240}
                  suffix="min"
                  onChange={(v) => updateSetting('buildTimeoutMin', v)}
                />
                <NumberRow
                  label="Keep build history"
                  hint="Number of past builds retained per app"
                  value={settings.keepBuildHistory}
                  step={1}
                  min={1}
                  max={200}
                  suffix="entries"
                  onChange={(v) => updateSetting('keepBuildHistory', v)}
                />
              </div>
            )}
          </SettingsCard>

          {/* ── About card ── */}
          <SettingsCard title="About" icon={<Blocks size={12} />}>
            <div className="space-y-2 text-[11px] text-muted-foreground/70">
              <p>
                <span className="text-foreground/80">home-server</span> — a
                self-hosted dashboard that turns natural-language prompts into
                running web apps on your Raspberry Pi.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <a
                  href="https://github.com/acanturgut/home-server"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-blue-400/80 hover:text-blue-300 inline-flex items-center gap-1">
                  <ExternalLink size={9} /> GitHub
                </a>
                <a
                  href={`${API_BASE}/api/health`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-blue-400/80 hover:text-blue-300 inline-flex items-center gap-1">
                  <ExternalLink size={9} /> /api/health
                </a>
                <a
                  href={`${API_BASE}/api/system`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-blue-400/80 hover:text-blue-300 inline-flex items-center gap-1">
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
                className="text-[10px] flex items-center gap-1 px-2 py-1 text-muted-foreground/50 hover:text-foreground/80 disabled:opacity-30 transition-colors">
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
                className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors">
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
              <p className="text-[11px] font-medium text-foreground/70">
                New Node
              </p>
              <NodeFormInline form={form} setForm={setForm} models={models} />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowAdd(false)}
                  className="px-2.5 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
                <button
                  onClick={addNode}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-foreground/10 hover:bg-foreground/15 transition-colors">
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
                    <span className="text-[10px] text-muted-foreground">
                      {n.tier}
                    </span>
                    {n.gpu && (
                      <span className="text-[10px] text-muted-foreground">
                        {n.gpu}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">
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
                      className="px-2 py-1 rounded text-[11px] text-violet-400 hover:bg-violet-500/10 transition-colors">
                      <Power size={13} />
                    </button>
                  )}
                  <button
                    onClick={() =>
                      editId === n.id ? setEditId(null) : startEdit(n)
                    }
                    className={`px-2 py-1 rounded text-[11px] transition-colors ${editId === n.id ? 'text-blue-300 bg-blue-500/10' : 'text-muted-foreground hover:text-foreground'}`}>
                    {editId === n.id ? 'Close' : 'Edit'}
                  </button>
                  <button
                    onClick={() => removeNode(n.id)}
                    className="px-2 py-1 rounded text-[11px] text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors">
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
                      className="px-2.5 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={saveNode}
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-foreground/10 hover:bg-foreground/15 transition-colors">
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

      {/* ── HomeKit Tab ── */}
      {tab === 'homekit' && <HomeKitPanel />}

      {/* ── Prompts Tab ── */}
      {tab === 'prompts' && (
        <PromptsEditor
          prompts={prompts}
          onLoad={refreshPrompts}
          onChange={updatePrompt}
          onSave={savePrompts}
          onReset={resetPrompts}
          saving={promptsSaving}
          dirty={promptsDirty}
        />
      )}

      {/* ── API Tab ── */}
      {tab === 'api' && (
        <div className="space-y-3">
          {ENDPOINTS.map((ep) => (
            <EndpointCard key={`${ep.method}-${ep.path}`} ep={ep} />
          ))}
        </div>
      )}
    </div>
  );
}
