import { useState, type Dispatch, type SetStateAction } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { toast } from '@/components/ui/toast';
import type { NodeInput } from '@/features/settings/api';
import { errorMessage } from '@/lib/format';
import { nodesApi } from '@/lib/nodes';

const TEXT_FIELDS = [
  { key: 'name', label: 'Name', placeholder: 'My PC', required: true },
  {
    key: 'host',
    label: 'Host',
    placeholder: 'http://192.168.50.100:1234',
    required: true,
  },
  { key: 'gpu', label: 'GPU', placeholder: 'RTX 4090' },
  { key: 'mac', label: 'MAC (Wake-on-LAN)', placeholder: 'AA:BB:CC:DD:EE:FF' },
] as const;

/**
 * Node fields: identity, tier, model and temperature. With `onlineNodeId`
 * (editing a reachable node) it also lists the loaded models with eject,
 * and loads another model by name.
 */
export function NodeFormInline({
  form,
  setForm,
  models,
  onlineNodeId,
}: {
  form: NodeInput;
  setForm: Dispatch<SetStateAction<NodeInput>>;
  models: string[];
  onlineNodeId?: string;
}) {
  const set = (patch: Partial<NodeInput>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {TEXT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <Input
              value={form[f.key]}
              onChange={(e) => set({ [f.key]: e.target.value })}
              placeholder={f.placeholder}
              required={'required' in f}
            />
          </Field>
        ))}
        <Field label="Tier">
          <Select
            value={form.tier}
            onChange={(e) => set({ tier: e.target.value })}
          >
            <option value="high-end">High-end</option>
            <option value="low-end">Low-end</option>
          </Select>
        </Field>
        <Field label="Model">
          {models.length > 0 ? (
            <Select
              value={form.model}
              onChange={(e) => set({ model: e.target.value })}
            >
              <option value="">Select a model</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              value={form.model}
              onChange={(e) => set({ model: e.target.value })}
              placeholder="model-name"
            />
          )}
        </Field>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Temperature</span>
          <span className="font-mono text-muted-foreground tabular-nums">
            {form.temperature.toFixed(2)}
          </span>
        </div>
        <Slider
          aria-label="Temperature"
          value={form.temperature}
          min={0}
          max={2}
          step={0.05}
          onValueChange={(temperature) => set({ temperature })}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Precise</span>
          <span>Creative</span>
        </div>
      </div>

      {onlineNodeId && (
        <LoadedModels
          nodeId={onlineNodeId}
          models={models}
          active={form.model}
          onSetActive={(model) => set({ model })}
        />
      )}
    </div>
  );
}

/** LM Studio models on a live node: set active, eject, or load by name. */
function LoadedModels({
  nodeId,
  models,
  active,
  onSetActive,
}: {
  nodeId: string;
  models: string[];
  active: string;
  onSetActive: (model: string) => void;
}) {
  // Local copy so load/eject update the list optimistically; reset when
  // the parent hands over a new `models` array.
  const [list, setList] = useState(models);
  const [prevModels, setPrevModels] = useState(models);
  if (models !== prevModels) {
    setPrevModels(models);
    setList(models);
  }
  const [pending, setPending] = useState<string | null>(null);
  const [loadName, setLoadName] = useState('');

  const run = async (model: string, load: boolean) => {
    setPending(model);
    try {
      if (load) {
        await nodesApi.loadModel(nodeId, model);
        setList((prev) => [...new Set([...prev, model])]);
        setLoadName('');
      } else {
        await nodesApi.unloadModel(nodeId, model);
        setList((prev) => prev.filter((m) => m !== model));
      }
    } catch (e) {
      toast(`${load ? 'Loading' : 'Ejecting'} ${model} failed`, {
        tone: 'error',
        description: errorMessage(e),
      });
    }
    setPending(null);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Loaded models</p>
      {list.length > 0 && (
        <ul className="space-y-1">
          {list.map((m) => (
            <li
              key={m}
              className="flex items-center gap-2 rounded-md bg-muted/50 py-1 pr-1 pl-3"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-sm">
                {m}
              </span>
              {active === m ? (
                <Badge tone="success">Active</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onSetActive(m)}
                >
                  Set active
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                loading={pending === m}
                disabled={pending !== null}
                onClick={() => run(m, false)}
              >
                Eject
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          aria-label="Model to load"
          placeholder="model-identifier"
          value={loadName}
          onChange={(e) => setLoadName(e.target.value)}
          onKeyDown={(e) => {
            // Enter loads the model instead of submitting the node form.
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (loadName.trim() && pending === null)
              void run(loadName.trim(), true);
          }}
          className="flex-1 font-mono"
        />
        <Button
          variant="secondary"
          loading={pending !== null && pending === loadName.trim()}
          disabled={pending !== null || !loadName.trim()}
          onClick={() => run(loadName.trim(), true)}
        >
          Load
        </Button>
      </div>
    </div>
  );
}
