import React, { useEffect, useState } from 'react';
import { Circle } from 'lucide-react';
import { API_BASE } from '@/lib/api';

/** Persisted compute-node configuration row. */
export interface NodeConfig {
  id: string;
  name: string;
  host: string;
  tier: string;
  gpu?: string;
  mac?: string;
  model?: string;
  online?: boolean;
  temperature?: number | null;
}

/** Inline node-editor form: identity fields + tier/model + temperature slider
 * + LM-Studio model load/eject controls when the node is online. */
export function NodeFormInline({
  form,
  setForm,
  models,
  nodeId,
  online,
}: {
  form: {
    name: string;
    host: string;
    tier: string;
    gpu: string;
    mac: string;
    model: string;
    temperature: number;
  };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
  models: string[];
  nodeId?: string;
  online?: boolean;
}) {
  const [loadingModel, setLoadingModel] = useState<string | null>(null);
  const [localModels, setLocalModels] = useState<string[]>(models);

  useEffect(() => {
    setLocalModels(models);
  }, [models]);

  const loadModel = async (model: string) => {
    if (!nodeId) return;
    setLoadingModel(model);
    try {
      const res = await fetch(`${API_BASE}/api/nodes/${nodeId}/models/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      if (res.ok) setLocalModels((prev) => [...new Set([...prev, model])]);
    } catch {
      // Ignore: keep current model list, surface error via parent if needed.
    }
    setLoadingModel(null);
  };

  const unloadModel = async (model: string) => {
    if (!nodeId) return;
    setLoadingModel(model);
    try {
      await fetch(`${API_BASE}/api/nodes/${nodeId}/models/unload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      setLocalModels((prev) => prev.filter((m) => m !== model));
    } catch {
      // Ignore: leave optimistic UI alone.
    }
    setLoadingModel(null);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { key: 'name', label: 'Name', placeholder: 'My PC' },
          {
            key: 'host',
            label: 'Host',
            placeholder: 'http://192.168.50.100:1234',
          },
          { key: 'gpu', label: 'GPU', placeholder: 'RTX 4090' },
          { key: 'mac', label: 'MAC', placeholder: 'AA:BB:CC:DD:EE:FF' },
        ].map((f) => (
          <div key={f.key} className="space-y-0.5">
            <label className="text-[10px] text-muted-foreground/60">
              {f.label}
            </label>
            <input
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              value={(form as any)[f.key]}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, [f.key]: e.target.value }))
              }
              placeholder={f.placeholder}
              className="h-7 text-xs w-full rounded-md border border-border/30 bg-transparent px-2 focus:outline-none focus:ring-1 focus:ring-ring/30"
            />
          </div>
        ))}
        <div className="space-y-0.5">
          <label className="text-[10px] text-muted-foreground/60">Tier</label>
          <select
            value={form.tier}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, tier: e.target.value }))
            }
            className="h-7 text-xs w-full rounded-md border border-border/30 bg-transparent px-2">
            <option value="high-end">High-end</option>
            <option value="low-end">Low-end</option>
          </select>
        </div>
        <div className="space-y-0.5">
          <label className="text-[10px] text-muted-foreground/60">Model</label>
          {localModels.length > 0 ? (
            <select
              value={form.model}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, model: e.target.value }))
              }
              className="h-7 text-xs w-full rounded-md border border-border/30 bg-transparent px-2">
              <option value="">Select...</option>
              {localModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={form.model}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, model: e.target.value }))
              }
              placeholder="model-name"
              className="h-7 text-xs w-full rounded-md border border-border/30 bg-transparent px-2 focus:outline-none focus:ring-1 focus:ring-ring/30"
            />
          )}
        </div>
      </div>

      {/* Temperature */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-muted-foreground/60">
            Temperature
          </label>
          <span className="text-[10px] font-mono text-muted-foreground">
            {form.temperature.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="2"
          step="0.05"
          value={form.temperature}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              temperature: parseFloat(e.target.value),
            }))
          }
          className="w-full h-1.5 rounded-full appearance-none bg-border/30 accent-blue-500"
        />
        <div className="flex justify-between text-[9px] text-muted-foreground/40">
          <span>Precise</span>
          <span>Creative</span>
        </div>
      </div>

      {/* Loaded models with eject */}
      {nodeId && online && localModels.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground/60">
            Loaded Models
          </label>
          {localModels.map((m) => (
            <div
              key={m}
              className="flex items-center justify-between py-1 px-2 rounded-md bg-muted/20 text-xs">
              <span className="font-mono text-[11px] truncate">{m}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {form.model !== m && (
                  <button
                    onClick={() => setForm((prev) => ({ ...prev, model: m }))}
                    className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
                    Set Active
                  </button>
                )}
                {form.model === m && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <Circle size={6} fill="currentColor" /> Active
                  </span>
                )}
                <button
                  onClick={() => unloadModel(m)}
                  disabled={loadingModel === m}
                  className="text-[10px] text-red-400/60 hover:text-red-400 disabled:opacity-50 transition-colors">
                  {loadingModel === m ? '...' : '⏏ Eject'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load model by name */}
      {nodeId && online && (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/60">
            Load Model
          </label>
          <div className="flex gap-1.5">
            <input
              id={`load-model-${nodeId}`}
              placeholder="model-identifier"
              className="h-7 text-xs flex-1 rounded-md border border-border/30 bg-transparent px-2 focus:outline-none focus:ring-1 focus:ring-ring/30 font-mono"
            />
            <button
              onClick={() => {
                const el = document.getElementById(
                  `load-model-${nodeId}`,
                ) as HTMLInputElement;
                if (el?.value) {
                  loadModel(el.value);
                  el.value = '';
                }
              }}
              disabled={loadingModel !== null}
              className="h-7 px-2.5 rounded-md text-[11px] font-medium bg-foreground/10 hover:bg-foreground/15 disabled:opacity-50 transition-colors">
              {loadingModel ? '...' : 'Load'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
