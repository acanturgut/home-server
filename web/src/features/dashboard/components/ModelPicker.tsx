import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { StatusDot } from '@/components/ui/status-dot';
import { dashboardApi, type NodeModelStatus } from '@/features/dashboard/api';
import { useAction } from '@/hooks/useAction';
import { nodesApi } from '@/lib/nodes';
import { cn } from '@/lib/utils';

/** Loaded-model status of one node, with load / eject for its models. */
export function ModelPicker({ nodeId }: { nodeId: string }) {
  const [models, setModels] = useState<NodeModelStatus[] | null>(null);
  const [selected, setSelected] = useState('');

  const fetchModels = useCallback(async () => {
    const list = (await dashboardApi.nodeModelsStatus(nodeId)).models ?? [];
    setModels(list);
    // Default the picker to the loaded model, else the first one.
    setSelected(
      (prev) => prev || list.find((m) => m.loaded)?.id || list[0]?.id || '',
    );
  }, [nodeId]);
  const refresh = useAction(fetchModels);
  const { run: reload } = refresh;
  useEffect(() => {
    void reload();
  }, [reload]);

  const act = useAction(async (load: boolean, model: string) => {
    await (load ? nodesApi.loadModel : nodesApi.unloadModel)(nodeId, model);
    await fetchModels();
  });

  const busy = refresh.busy || act.busy;
  const error = act.error ?? refresh.error;
  const loaded = models?.find((m) => m.loaded);

  if (!models) {
    // Nothing listening on the model port is a normal state (LM Studio not
    // started), not a failure.
    const noServer = /connection refused/i.test(String(error ?? ''));
    return error ? (
      <div
        className={cn(
          'flex items-center gap-2 text-xs',
          noServer ? 'text-muted-foreground' : 'text-destructive',
        )}
      >
        <span className="min-w-0 truncate">
          {noServer
            ? 'No model server running'
            : `Model API unavailable: ${error}`}
        </span>
        <RefreshButton onClick={reload} busy={busy} label="Retry" />
      </div>
    ) : (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner size={12} />
        Loading models…
      </p>
    );
  }
  if (models.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No models on this host</p>
    );
  }

  const selectedLoaded = models.some((m) => m.id === selected && m.loaded);
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <StatusDot status={loaded ? 'online' : 'offline'} />
        <span className="min-w-0 truncate">
          {loaded ? `Loaded: ${loaded.id}` : 'No model loaded'}
        </span>
      </p>
      <div className="flex items-center gap-1">
        <Select
          selectSize="sm"
          aria-label="Model"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={busy}
          className="min-w-0 flex-1"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
              {m.loaded ? ' (loaded)' : ''}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || !selected || selectedLoaded}
          onClick={() => act.run(true, selected)}
        >
          Load
        </Button>
        {loaded && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => act.run(false, loaded.id)}
          >
            Eject
          </Button>
        )}
        <RefreshButton onClick={reload} busy={busy} label="Refresh models" />
      </div>
      {error && <p className="truncate text-xs text-destructive">{error}</p>}
    </div>
  );
}
