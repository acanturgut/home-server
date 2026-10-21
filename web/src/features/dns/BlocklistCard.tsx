import { useCallback, useState } from 'react';
import { Shield, ShieldOff, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { RefreshButton } from '@/components/ui/refresh-button';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { Switch } from '@/components/ui/switch';
import { useAction } from '@/hooks/useAction';
import { useConfirm } from '@/hooks/useConfirm';
import { usePolling } from '@/hooks/usePolling';
import { dnsApi, type BlocklistStatus } from '@/features/dns/api';
import { formatTime } from '@/lib/format';

/**
 * Pi-hole-style ad blocker: global switch, live counters, hosts-format
 * blocklist sources and an allowlist that overrides them.
 */
export function BlocklistCard() {
  const confirm = useConfirm();
  const [status, setStatus] = useState<BlocklistStatus | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [allowDomain, setAllowDomain] = useState('');

  const load = useCallback(async () => {
    const s = await dnsApi.blocklist.status();
    if (s) setStatus(s);
  }, []);
  usePolling(load, 5_000);

  // Every change goes through here: one busy flag, one error, then a reload.
  const act = useAction(async (change: () => Promise<unknown>) => {
    await change();
    await load();
  });

  if (!status) return <SkeletonRows rows={4} block />;

  const allowlist = status.allowlist ?? [];

  const removeSource = async (sourceUrl: string, sourceName: string) => {
    const ok = await confirm({
      title: 'Remove blocklist source?',
      body:
        sourceName === sourceUrl ? sourceUrl : `${sourceName} (${sourceUrl})`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (ok) void act.run(() => dnsApi.blocklist.removeSource(sourceUrl));
  };

  return (
    <Card className="space-y-4">
      <CardHeader
        title="Ad blocker"
        icon={status.enabled ? <Shield /> : <ShieldOff />}
        description="Blocked queries return NXDOMAIN. Lists refresh every 24 hours."
        actions={
          <>
            <RefreshButton
              label="Refresh blocklists now"
              onClick={() => act.run(() => dnsApi.blocklist.refresh())}
              busy={status.refreshing}
            />
            <Switch
              aria-label="Ad blocker"
              checked={status.enabled}
              disabled={act.busy}
              onCheckedChange={(on) =>
                act.run(() => dnsApi.blocklist.setEnabled(on))
              }
            />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile
          label="Blocked domains"
          value={status.blocked_count.toLocaleString()}
        />
        <StatTile
          label="Blocked queries"
          value={status.blocked_hits.toLocaleString()}
        />
        <StatTile label="Sources" value={status.sources.length} />
        <StatTile
          label="Updated"
          value={formatTime(status.last_refreshed) || '—'}
        />
      </div>

      {act.error && <Alert>{act.error}</Alert>}

      <section className="space-y-3">
        <h4 className="text-sm font-medium">Sources</h4>
        {status.sources.length === 0 ? (
          <EmptyState
            title="No sources yet"
            description="Add a hosts-format list URL below."
            className="py-6"
          />
        ) : (
          <ul className="space-y-1">
            {status.sources.map((src) => (
              <li
                key={src.url}
                className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2"
              >
                <Switch
                  aria-label={`Use ${src.name}`}
                  checked={src.enabled}
                  onCheckedChange={(on) =>
                    act.run(() => dnsApi.blocklist.toggleSource(src.url, on))
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{src.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {src.url}
                  </p>
                  {src.last_error && (
                    <p className="truncate text-xs text-destructive">
                      {src.last_error}
                    </p>
                  )}
                </div>
                <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
                  {src.entries.toLocaleString()}
                </span>
                <IconButton
                  icon={<Trash2 />}
                  label={`Remove ${src.name}`}
                  onClick={() => removeSource(src.url, src.name)}
                />
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const u = url.trim();
            void act.run(async () => {
              await dnsApi.blocklist.addSource(name.trim() || u, u);
              setName('');
              setUrl('');
              await dnsApi.blocklist.refresh();
            });
          }}
        >
          <Field label="Name (optional)" className="sm:flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="List URL" className="sm:flex-2">
            <Input
              type="url"
              placeholder="https://…/hosts"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={act.busy || !url.trim()}>
            Add
          </Button>
        </form>
      </section>

      <section className="space-y-3 pt-4">
        <div>
          <h4 className="text-sm font-medium">Allowlist</h4>
          <p className="text-xs text-muted-foreground">
            Never blocked, including subdomains.
          </p>
        </div>
        {allowlist.length > 0 && (
          <ul className="space-y-1">
            {allowlist.map((d) => (
              <li
                key={d}
                className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-sm">
                  {d}
                </span>
                <IconButton
                  icon={<Trash2 />}
                  label={`Remove ${d} from the allowlist`}
                  onClick={() => act.run(() => dnsApi.blocklist.removeAllow(d))}
                />
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const d = allowDomain.trim();
            void act.run(async () => {
              await dnsApi.blocklist.addAllow(d);
              setAllowDomain('');
            });
          }}
        >
          <Field label="Domain" className="flex-1">
            <Input
              placeholder="googlevideo.com"
              value={allowDomain}
              onChange={(e) => setAllowDomain(e.target.value)}
            />
          </Field>
          <Button
            type="submit"
            variant="secondary"
            disabled={act.busy || !allowDomain.trim()}
          >
            Allow
          </Button>
        </form>
      </section>
    </Card>
  );
}
