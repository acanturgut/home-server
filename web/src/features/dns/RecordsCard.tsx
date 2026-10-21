import { useMemo, useState } from 'react';
import { Globe, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { useAction } from '@/hooks/useAction';
import { useConfirm } from '@/hooks/useConfirm';
import { dnsApi, type DNSRecord } from '@/features/dns/api';
import { errorMessage } from '@/lib/format';

const EMPTY_DRAFT: DNSRecord = { name: '', type: 'A', value: '' };

/** Local A/AAAA/CNAME records: sorted list with delete, plus an add form. */
export function RecordsCard({
  records,
  reload,
}: {
  records: DNSRecord[];
  reload: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const refresh = useAction(reload);
  const [draft, setDraft] = useState<DNSRecord>(EMPTY_DRAFT);
  const add = useAction(async () => {
    await dnsApi.add({
      name: draft.name.trim(),
      type: draft.type,
      value: draft.value.trim(),
      ttl: draft.ttl || 300,
    });
    setDraft(EMPTY_DRAFT);
    await reload();
  });

  const sorted = useMemo(
    () =>
      [...records].sort(
        (a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type),
      ),
    [records],
  );

  const onDelete = async (rec: DNSRecord) => {
    const ok = await confirm({
      title: 'Delete record?',
      body: `${rec.type} ${rec.name} → ${rec.value}`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await dnsApi.remove({ name: rec.name, type: rec.type, value: rec.value });
      await reload();
    } catch (e) {
      toast("Couldn't delete record", {
        tone: 'error',
        description: errorMessage(e),
      });
    }
  };

  const set = (patch: Partial<DNSRecord>) =>
    setDraft((d) => ({ ...d, ...patch }));

  return (
    <Card className="space-y-4">
      <CardHeader
        title="Records"
        icon={<Globe />}
        description="Changes apply immediately. Flush your client's DNS cache to see them."
        actions={<RefreshButton onClick={refresh.run} busy={refresh.busy} />}
      />

      {sorted.length === 0 ? (
        <EmptyState
          dashed
          title="No records yet"
          description="Add one below."
          className="py-6"
        />
      ) : (
        <ul className="divide-y rounded-md border">
          {sorted.map((r) => (
            <li
              key={`${r.type}|${r.name}|${r.value}`}
              className="flex items-center gap-3 px-3 py-2 text-sm"
            >
              <Badge mono className="w-14 justify-center">
                {r.type}
              </Badge>
              <span className="min-w-0 flex-1 truncate font-mono">
                {r.name}
              </span>
              <span className="hidden min-w-0 flex-1 truncate font-mono text-muted-foreground sm:block">
                {r.value}
              </span>
              <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
                {r.ttl ?? 300}s
              </span>
              <IconButton
                icon={<Trash2 />}
                label={`Delete ${r.name}`}
                onClick={() => onDelete(r)}
              />
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void add.run();
        }}
      >
        <Field label="Name" className="sm:flex-1">
          <Input
            placeholder="canshome.com"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </Field>
        <Field label="Type" className="sm:w-24">
          <Select
            value={draft.type}
            onChange={(e) => set({ type: e.target.value as DNSRecord['type'] })}
          >
            <option value="A">A</option>
            <option value="AAAA">AAAA</option>
            <option value="CNAME">CNAME</option>
          </Select>
        </Field>
        <Field label="Value" className="sm:flex-1">
          <Input
            placeholder={
              draft.type === 'CNAME' ? 'target.example.com' : '192.168.1.10'
            }
            value={draft.value}
            onChange={(e) => set({ value: e.target.value })}
          />
        </Field>
        <Field label="TTL" className="sm:w-24">
          <Input
            type="number"
            min={0}
            placeholder="300"
            value={draft.ttl ?? ''}
            onChange={(e) => set({ ttl: e.target.valueAsNumber || undefined })}
          />
        </Field>
        <Button
          type="submit"
          loading={add.busy}
          disabled={!draft.name.trim() || !draft.value.trim()}
        >
          Add
        </Button>
      </form>
      {add.error && <Alert>{add.error}</Alert>}
    </Card>
  );
}
