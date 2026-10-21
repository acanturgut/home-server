import { useCallback, useEffect, useState } from 'react';
import {
  settingsApi,
  type NodeConfig,
  type NodeInput,
} from '@/features/settings/api';
import { toast } from '@/components/ui/toast';
import { useAction } from '@/hooks/useAction';
import { useConfirm } from '@/hooks/useConfirm';
import { errorMessage } from '@/lib/format';
import { nodesApi } from '@/lib/nodes';

export type NodeRow = NodeConfig & { online: boolean };

/** `editing` value while the "new node" form is open. */
export const NEW_NODE = 'new';

const EMPTY: NodeInput = {
  name: '',
  host: '',
  tier: 'high-end',
  gpu: '',
  mac: '',
  model: '',
  temperature: 0.7,
};

const fail = (what: string, e: unknown) =>
  toast(`${what} failed`, { tone: 'error', description: errorMessage(e) });

/**
 * Compute-node CRUD for Settings → Nodes. Config rows come from /api/nodes
 * (they carry the temperature); reachability from /api/health. One form is
 * open at a time: `editing` is a node id, `NEW_NODE`, or null.
 */
export function useNodes() {
  const confirm = useConfirm();
  const [nodes, setNodes] = useState<NodeRow[] | null>(null);
  const [defaultTemperature, setDefaultTemperature] = useState(
    EMPTY.temperature,
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<NodeInput>(EMPTY);
  const [models, setModels] = useState<string[]>([]);

  const fetchNodes = useCallback(async () => {
    const [list, health, settings] = await Promise.all([
      settingsApi.listNodes(),
      settingsApi.getHealth().catch(() => null),
      settingsApi.getSettings(),
    ]);
    const online = new Set(
      health?.backends?.nodes?.filter((n) => n.online).map((n) => n.id),
    );
    setNodes((list ?? []).map((n) => ({ ...n, online: online.has(n.id) })));
    if (settings) setDefaultTemperature(settings.defaultTemperature);
  }, []);
  const { run: reload, busy, error } = useAction(fetchNodes);
  useEffect(() => {
    void reload();
  }, [reload]);

  const openAdd = () => {
    setForm({ ...EMPTY, temperature: defaultTemperature });
    setModels([]);
    setEditing(NEW_NODE);
  };

  const startEdit = (n: NodeRow) => {
    setForm({
      name: n.name,
      host: n.host,
      tier: n.tier,
      gpu: n.gpu ?? '',
      mac: n.mac ?? '',
      model: n.model ?? '',
      temperature: n.temperature ?? defaultTemperature,
    });
    setModels([]);
    setEditing(n.id);
    if (n.online) {
      void settingsApi
        .getNodeModels(n.id)
        .then((d) => setModels(d?.models ?? []));
    }
  };

  const close = () => setEditing(null);

  /** Throws on failure so the open form can show the error. */
  const save = async () => {
    if (editing === NEW_NODE) await settingsApi.addNode(form);
    else if (editing) await settingsApi.updateNode(editing, form);
    setEditing(null);
    await reload();
  };

  const remove = async (n: NodeRow) => {
    const ok = await confirm({
      title: `Remove ${n.name}?`,
      body: 'It stops receiving requests. You can add it again later.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await settingsApi.deleteNode(n.id);
      if (editing === n.id) setEditing(null);
      await reload();
    } catch (e) {
      fail('Removing the node', e);
    }
  };

  const wake = async (n: NodeRow) => {
    try {
      await nodesApi.wake(n.id);
      toast(`Wake-on-LAN sent to ${n.name}`, { tone: 'success' });
    } catch (e) {
      fail('Wake', e);
    }
  };

  return {
    nodes,
    loading: busy || (!nodes && !error),
    error,
    reload,
    editing,
    form,
    setForm,
    models,
    openAdd,
    startEdit,
    close,
    save,
    remove,
    wake,
  };
}
