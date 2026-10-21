import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { HomeKitPanel } from '@/features/homekit';
import {
  homeApi,
  type HomeBridge,
  type HomeSnapshot,
} from '@/features/home/api';
import { BRIDGE_KINDS } from '@/features/home/bridgeKinds';
import { AddBridgeWizard } from '@/features/home/components/AddBridgeWizard';
import { EditBridgeDialog } from '@/features/home/components/EditBridgeDialog';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Section } from '@/components/ui/section';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusDot } from '@/components/ui/status-dot';
import { toast } from '@/components/ui/toast';
import { useAction } from '@/hooks/useAction';
import { useConfirm } from '@/hooks/useConfirm';
import { usePolling } from '@/hooks/usePolling';
import { errorMessage, plural, relTime } from '@/lib/format';

/** Settings → Smart Home: bridges, then the HomeKit bridge. */
export function SmartHomeSettings() {
  return (
    <div className="space-y-8">
      <BridgesSection />
      <Section
        title="HomeKit bridge"
        description="Expose your nodes and home-server actions to Apple Home for Siri and iPhone control."
      >
        <HomeKitPanel />
      </Section>
    </div>
  );
}

function BridgesSection() {
  const { user } = useAuth();
  // Bridge CRUD and pairing are admin-only on the server.
  const isAdmin = user?.role === 'admin';
  const confirm = useConfirm();
  const [snap, setSnap] = useState<HomeSnapshot | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<HomeBridge | null>(null);

  const load = async () => {
    const next = await homeApi.list();
    if (next) setSnap(next);
  };
  usePolling(load, 10_000);
  const refresh = useAction(async () => {
    await homeApi.refresh();
    await load();
  });

  const remove = async (b: HomeBridge) => {
    const ok = await confirm({
      title: `Remove ${b.name}?`,
      body: 'Its devices disappear from the dashboard.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await homeApi.deleteBridge(b.id);
      toast(`Removed ${b.name}`);
    } catch (e) {
      toast(`Couldn't remove ${b.name}`, {
        tone: 'error',
        description: errorMessage(e),
      });
    }
    await load();
  };

  const counts = new Map<string, number>();
  snap?.devices.forEach((d) =>
    counts.set(d.bridge_id, (counts.get(d.bridge_id) ?? 0) + 1),
  );

  return (
    <Section
      title="Bridges"
      description="Philips Hue, IKEA DIRIGERA, LG webOS TVs and HTTP switches. Their devices show up on the Smart Home page."
      toolbar={
        <div className="flex items-center gap-1">
          <RefreshButton
            label="Refresh devices"
            onClick={() => void refresh.run()}
            busy={refresh.busy}
          />
          {isAdmin && !adding && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus />
              Add bridge
            </Button>
          )}
        </div>
      }
    >
      {!isAdmin && (
        <Alert tone="info">Only admins can add, edit or remove bridges.</Alert>
      )}
      {refresh.error && <Alert>{refresh.error}</Alert>}
      {adding && (
        <AddBridgeWizard
          onAdded={() => {
            setAdding(false);
            toast('Bridge added', { tone: 'success' });
            void load();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {!snap ? (
        <SkeletonRows rows={2} block />
      ) : snap.bridges.length > 0 ? (
        <Card className="space-y-0.5 p-2">
          {snap.bridges.map((b) => (
            <BridgeRow
              key={b.id}
              bridge={b}
              count={counts.get(b.id) ?? 0}
              onEdit={isAdmin ? () => setEditing(b) : undefined}
              onRemove={isAdmin ? () => void remove(b) : undefined}
            />
          ))}
        </Card>
      ) : (
        !adding && (
          <EmptyState
            title="No bridges yet"
            description={
              isAdmin
                ? 'Add a bridge to start with a step-by-step pairing flow.'
                : 'Ask an admin to add one.'
            }
          />
        )
      )}

      {editing && (
        <EditBridgeDialog
          key={editing.id}
          bridge={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </Section>
  );
}

function BridgeRow({
  bridge: b,
  count,
  onEdit,
  onRemove,
}: {
  bridge: HomeBridge;
  count: number;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const ok = b.status === 'ok' || (!b.status && count > 0);
  const kind = BRIDGE_KINDS[b.kind];
  const meta = [
    kind.hostPlaceholder && b.host,
    plural(count, 'device'),
    b.added && `added ${relTime(new Date(b.added).getTime())}`,
  ].filter(Boolean);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <StatusDot status={ok ? 'online' : 'warning'} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium">{b.name}</span>
          <span className="text-xs text-muted-foreground">{kind.label}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {meta.join(' · ')}
        </p>
        {b.error && <p className="mt-1 text-xs text-warning">{b.error}</p>}
      </div>
      {onEdit && (
        <IconButton
          icon={<Pencil />}
          label={`Edit ${b.name}`}
          onClick={onEdit}
        />
      )}
      {onRemove && (
        <IconButton
          icon={<Trash2 />}
          label={`Remove ${b.name}`}
          onClick={onRemove}
        />
      )}
    </div>
  );
}
