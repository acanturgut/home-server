import type { FormEvent, ReactNode } from 'react';
import { Plus, Power, Server, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusDot } from '@/components/ui/status-dot';
import { NodeFormInline } from '@/features/settings/components/NodeFormInline';
import {
  NEW_NODE,
  useNodes,
  type NodeRow,
} from '@/features/settings/hooks/useNodes';
import { useAction } from '@/hooks/useAction';
import { plural } from '@/lib/format';

/** Settings → Nodes: inference workers, with add / edit / wake / remove. */
export function NodesTab() {
  const n = useNodes();
  const adding = n.editing === NEW_NODE;

  const editor = (row?: NodeRow) => (
    <NodeEditor
      submitLabel={row ? 'Save' : 'Add node'}
      onSubmit={n.save}
      onCancel={n.close}
    >
      <NodeFormInline
        form={n.form}
        setForm={n.setForm}
        models={n.models}
        onlineNodeId={row?.online ? row.id : undefined}
      />
    </NodeEditor>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {n.nodes ? plural(n.nodes.length, 'node') : 'Loading nodes…'}
        </p>
        <div className="flex items-center gap-1">
          <RefreshButton onClick={n.reload} busy={n.loading} />
          <Button
            size="sm"
            variant="secondary"
            onClick={n.openAdd}
            disabled={adding}
          >
            <Plus />
            Add node
          </Button>
        </div>
      </div>

      {n.error && <Alert>{n.error}</Alert>}

      {adding && (
        <Card className="space-y-4">
          <CardHeader title="New node" />
          {editor()}
        </Card>
      )}

      {!n.nodes
        ? n.loading && <SkeletonRows rows={3} block />
        : n.nodes.length === 0
          ? !adding && (
              <EmptyState
                icon={<Server />}
                title="No nodes yet"
                description="Add an inference worker so chat requests can run on it."
              />
            )
          : n.nodes.map((row) => {
              const open = n.editing === row.id;
              return (
                <Card key={row.id} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <StatusDot
                      status={row.online ? 'online' : 'offline'}
                      className="size-2"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        <span className="font-medium">{row.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {[row.tier, row.gpu].filter(Boolean).join(' · ')}
                        </span>
                      </p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {[
                          row.host,
                          row.model,
                          row.temperature != null && `t=${row.temperature}`,
                          row.mac,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {row.mac && (
                        <IconButton
                          icon={<Power />}
                          label={`Wake ${row.name}`}
                          onClick={() => n.wake(row)}
                        />
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-expanded={open}
                        onClick={() => (open ? n.close() : n.startEdit(row))}
                      >
                        {open ? 'Close' : 'Edit'}
                      </Button>
                      <IconButton
                        icon={<Trash2 />}
                        label={`Remove ${row.name}`}
                        onClick={() => n.remove(row)}
                      />
                    </div>
                  </div>
                  {open && <div className="pt-4">{editor(row)}</div>}
                </Card>
              );
            })}
    </div>
  );
}

/** Wraps the node fields in a form with its own busy / error state. */
function NodeEditor({
  submitLabel,
  onSubmit,
  onCancel,
  children,
}: {
  submitLabel: string;
  onSubmit: () => Promise<void>;
  onCancel: () => void;
  children: ReactNode;
}) {
  const { run, busy, error } = useAction(onSubmit);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run();
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      {children}
      {error && <Alert>{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
