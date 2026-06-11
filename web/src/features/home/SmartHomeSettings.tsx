import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, RefreshCcw, Edit3, Check, X } from 'lucide-react';
import { HomeKitPanel } from '@/features/homekit';
import {
  homeApi,
  type HomeBridge,
  type HomeBridgeKind,
  type HomeSnapshot,
} from '@/features/home/api';
import { AddBridgeWizard } from '@/features/home/AddBridgeWizard';
import { relTime } from '@/lib/format';

const KIND_LABEL: Record<HomeBridgeKind, string> = {
  hue: 'Philips Hue',
  dirigera: 'IKEA DIRIGERA',
  webos: 'LG webOS',
  http: 'HTTP',
};

/** Combined Smart Home + HomeKit settings tab. */
export function SmartHomeSettings() {
  return (
    <div className="space-y-6">
      <BridgesSection />
      <div className="border-t border-border/30 pt-6">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-foreground/90">
            HomeKit bridge
          </h2>
          <p className="text-xs text-muted-foreground/70">
            Expose your nodes (and home-server actions) to Apple Home for Siri /
            iPhone control.
          </p>
        </div>
        <HomeKitPanel />
      </div>
    </div>
  );
}

function BridgesSection() {
  const [snap, setSnap] = useState<HomeSnapshot>({
    devices: [],
    bridges: [],
    last_updated: '',
  });
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const load = async () => {
    const d = await homeApi.list();
    if (d) setSnap(d);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      await homeApi.refresh();
      await load();
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    if (
      !confirm('Remove this bridge? Devices will disappear from the dashboard.')
    )
      return;
    await homeApi.deleteBridge(id);
    await load();
  };

  const deviceCounts = useMemo(() => {
    const c: Record<string, number> = {};
    snap.devices.forEach((d) => {
      c[d.bridge_id] = (c[d.bridge_id] || 0) + 1;
    });
    return c;
  }, [snap.devices]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground/90">
            Smart Home bridges
          </h2>
          <p className="text-xs text-muted-foreground/70">
            Connect Philips Hue, IKEA DIRIGERA, LG webOS TVs, or any HTTP-based
            switch. Devices show up on the dashboard as on/off + brightness
            tiles.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={refresh}
            disabled={loading}
            className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-border/30 hover:border-border/60 text-muted-foreground/80 disabled:opacity-50">
            <RefreshCcw size={11} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-primary/30 bg-primary/10 hover:bg-primary/15 text-primary">
              <Plus size={11} />
              Add bridge
            </button>
          )}
        </div>
      </div>

      {adding && (
        <AddBridgeWizard
          onAdded={() => {
            setAdding(false);
            load();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {snap.bridges.length === 0 && !adding ? (
        <div className="rounded-lg border border-dashed border-border/30 px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground/70">
            No bridges yet — click "Add bridge" to start with a step-by-step
            pairing flow.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {snap.bridges.map((b) => (
            <BridgeRow
              key={b.id}
              b={b}
              count={deviceCounts[b.id] || 0}
              editing={editing === b.id}
              onEdit={() => setEditing(b.id)}
              onCancelEdit={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                load();
              }}
              onRemove={() => remove(b.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BridgeRow({
  b,
  count,
  editing,
  onEdit,
  onCancelEdit,
  onSaved,
  onRemove,
}: {
  b: HomeBridge;
  count: number;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  onRemove: () => void;
}) {
  const ok = b.status === 'ok' || (!b.status && count > 0);
  const lastSeen = relTime(b.added ? new Date(b.added).getTime() : undefined);

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            ok ? 'bg-emerald-400' : 'bg-amber-400'
          }`}
        />
        <span className="text-sm font-medium text-foreground/90">
          {b.name}
        </span>
        <span className="text-xs uppercase tracking-wider text-muted-foreground/60">
          {KIND_LABEL[b.kind]}
        </span>
        {b.host && (
          <span className="text-xs text-muted-foreground/60 font-mono">
            · {b.host}
          </span>
        )}
        <span className="text-xs text-muted-foreground/70 ml-auto">
          {count} device{count === 1 ? '' : 's'} · added {lastSeen}
        </span>
        {!editing && (
          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              title="Edit"
              className="p-1 rounded hover:bg-muted/40 text-muted-foreground/70 hover:text-foreground">
              <Edit3 size={12} />
            </button>
            <button
              onClick={onRemove}
              title="Remove"
              className="p-1 rounded hover:bg-red-500/10 text-muted-foreground/70 hover:text-red-400">
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
      {b.error && !editing && (
        <p className="mt-1 text-xs text-amber-400/85">{b.error}</p>
      )}
      {editing && (
        <EditBridge b={b} onCancel={onCancelEdit} onSaved={onSaved} />
      )}
    </div>
  );
}

function EditBridge({
  b,
  onCancel,
  onSaved,
}: {
  b: HomeBridge;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(b.name);
  const [host, setHost] = useState(b.host);
  const [token, setToken] = useState(b.token || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      await homeApi.updateBridge(b.id, { name, host, token });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        className="text-sm h-8 px-2 rounded border border-border/30 bg-background"
      />
      <input
        value={host}
        onChange={(e) => setHost(e.target.value)}
        placeholder="Host"
        className="text-sm h-8 px-2 rounded border border-border/30 bg-background font-mono"
      />
      <input
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Token"
        className="text-sm h-8 px-2 rounded border border-border/30 bg-background font-mono"
      />
      {err && <p className="sm:col-span-3 text-xs text-red-400">{err}</p>}
      <div className="sm:col-span-3 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-border/30 text-muted-foreground/80">
          <X size={11} />
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy}
          className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-primary/30 bg-primary/10 text-primary disabled:opacity-50">
          <Check size={11} />
          Save
        </button>
      </div>
    </div>
  );
}
