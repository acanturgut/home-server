import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Router,
  Trash2,
} from 'lucide-react';
import { dnsApi, type DNSRecord, type DNSStatus } from '@/features/dns/api';
import { dashboardApi } from '@/features/dashboard';
import { copyToClipboard } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  SettingsCard,
  SkeletonRows,
} from '@/components/ui/settings-rows';
import { BlocklistCard } from '@/features/dns/BlocklistCard';

/**
 * Settings → DNS tab. Manage A/AAAA/CNAME records served by the embedded
 * DNS server, view live query stats, and add/remove entries.
 */
export function DNSSettingsTab() {
  const [status, setStatus] = useState<DNSStatus | null>(null);
  const [records, setRecords] = useState<DNSRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lanIp, setLanIp] = useState<string>('');
  const [draft, setDraft] = useState<DNSRecord>({
    name: '',
    type: 'A',
    value: '',
    ttl: 300,
  });

  // Fetch host LAN IP once for the setup guide.
  useEffect(() => {
    dashboardApi.overview().then((d) => {
      if (d?.local_ip) setLanIp(d.local_ip);
    });
  }, []);

  const refresh = useCallback(
    () =>
      Promise.all([dnsApi.status(), dnsApi.records()]).then(([s, rs]) => {
        if (s) setStatus(s);
        if (rs) setRecords(rs);
        setLoading(false);
      }),
    [],
  );

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  const sorted = useMemo(
    () =>
      records
        ? [...records].sort(
            (a, b) =>
              a.name.localeCompare(b.name) || a.type.localeCompare(b.type),
          )
        : [],
    [records],
  );

  const onAdd = async () => {
    setErr(null);
    setBusy(true);
    try {
      await dnsApi.add({
        ...draft,
        name: draft.name.trim(),
        value: draft.value.trim(),
      });
      setDraft({ name: '', type: 'A', value: '', ttl: 300 });
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (rec: DNSRecord) => {
    if (
      !window.confirm(`Delete ${rec.type} ${rec.name} → ${rec.value}?`)
    )
      return;
    try {
      await dnsApi.remove({
        name: rec.name,
        type: rec.type,
        value: rec.value,
      });
      await refresh();
    } catch (e) {
      window.alert('Delete failed: ' + (e as Error).message);
    }
  };

  if (loading) return <SkeletonRows />;

  return (
    <div className="space-y-6">
      <RouterSetupGuide lanIp={lanIp} />

      <SettingsCard title="DNS server" icon={<Globe size={12} />}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <Stat
            label="Status"
            value={status?.running ? 'running' : 'stopped'}
            accent={status?.running ? 'good' : 'bad'}
          />
          <Stat
            label="Listening"
            value={status?.bind_addr || ':53'}
            mono
          />
          <Stat label="Records" value={String(status?.record_count ?? 0)} />
          <Stat
            label="Upstream"
            value={(status?.upstreams || []).join(' · ') || '—'}
            mono
          />
          <Stat
            label="Queries"
            value={String(status?.queries ?? 0)}
            mono
          />
          <Stat
            label="Local hits"
            value={String(status?.local_hits ?? 0)}
            mono
          />
          <Stat
            label="Forwarded"
            value={String(status?.forwarded ?? 0)}
            mono
          />
          <Stat
            label="Up errors"
            value={String(status?.upstream_errors ?? 0)}
            mono
            accent={status?.upstream_errors ? 'warn' : undefined}
          />
          <Stat
            label="Blocked"
            value={String(status?.blocked_hits ?? 0)}
            mono
            accent={status?.blocked_hits ? 'good' : undefined}
          />
        </div>
        {status?.last_error && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-rose-300/85">
            <AlertCircle size={12} className="mt-px shrink-0" />
            <span className="font-mono">{status.last_error}</span>
          </p>
        )}
        <div className="mt-3 text-xs text-muted-foreground/70 leading-relaxed">
          Point your router's DHCP <span className="font-mono">DNS server</span>{' '}
          option at this host's LAN IP so every device on the network resolves
          your local names through here. Public domains continue to forward to{' '}
          {(status?.upstreams || ['1.1.1.1']).join(' / ')}.
        </div>
      </SettingsCard>

      <SettingsCard
        title={`Records (${sorted.length})`}
        icon={<Globe size={12} />}
        actions={
          <button
            onClick={refresh}
            title="Refresh"
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-white/5">
            <RefreshCw size={12} />
          </button>
        }>
        <div className="space-y-1">
          {sorted.length === 0 && (
            <p className="text-xs text-muted-foreground/70 italic">
              No records yet. Add one below.
            </p>
          )}
          {sorted.map((r) => (
            <div
              key={`${r.type}|${r.name}|${r.value}`}
              className="flex items-center gap-2 px-2 py-1.5 rounded border border-border/15 bg-background/30 text-xs">
              <span className="text-xs uppercase tracking-wider text-violet-300/70 font-mono w-12">
                {r.type}
              </span>
              <span className="font-mono text-foreground/85 truncate flex-1">
                {r.name}
              </span>
              <span className="font-mono text-muted-foreground/65 truncate flex-1 hidden sm:block">
                → {r.value}
              </span>
              <span className="font-mono text-muted-foreground/65 text-xs tabular-nums hidden sm:inline">
                {r.ttl ?? 300}s
              </span>
              <button
                onClick={() => onDelete(r)}
                title="Delete"
                aria-label="Delete record"
                className="p-1 text-rose-300/70 hover:text-rose-200 rounded hover:bg-rose-500/10">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Add form */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_5rem_1fr_5rem_auto] gap-2 items-center">
          <Input
            placeholder="canshome.com"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
          <select
            value={draft.type}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                type: e.target.value as DNSRecord['type'],
              }))
            }
            className="h-8 rounded border border-border/40 bg-background/30 px-2 text-sm focus:outline-none focus:border-violet-400/40">
            <option value="A">A</option>
            <option value="AAAA">AAAA</option>
            <option value="CNAME">CNAME</option>
          </select>
          <Input
            placeholder={
              draft.type === 'CNAME' ? 'target.example.com' : '192.168.1.10'
            }
            value={draft.value}
            onChange={(e) =>
              setDraft((d) => ({ ...d, value: e.target.value }))
            }
          />
          <Input
            type="number"
            placeholder="TTL"
            value={draft.ttl ?? 300}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                ttl: parseInt(e.target.value || '300', 10),
              }))
            }
          />
          <Button
            onClick={onAdd}
            disabled={busy || !draft.name.trim() || !draft.value.trim()}
            size="sm">
            {busy ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Plus size={12} />
            )}{' '}
            Add
          </Button>
        </div>
        {err && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-300/85">
            <AlertCircle size={12} /> {err}
          </p>
        )}
        {!err && !busy && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-300/60">
            <CheckCircle2 size={12} /> Records take effect immediately —
            re-resolve on your client (e.g. <span className="font-mono">dscacheutil -flushcache</span>).
          </p>
        )}
      </SettingsCard>

      <BlocklistCard />
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: 'good' | 'bad' | 'warn';
}) {
  const color =
    accent === 'good'
      ? 'text-emerald-300/85'
      : accent === 'bad'
        ? 'text-rose-300/85'
        : accent === 'warn'
          ? 'text-amber-300/85'
          : 'text-foreground/85';
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
        {label}
      </span>
      <span className={`${mono ? 'font-mono' : ''} ${color}`}>{value}</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Router setup guide
// Walks the user through pointing their router's DHCP DNS at this host
// so every device on the LAN resolves home.lan / canshome.com locally.
// ────────────────────────────────────────────────────────────────────────
function RouterSetupGuide({ lanIp }: { lanIp: string }) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const ip = lanIp || '<your-host-ip>';

  const copyIp = () => {
    if (!lanIp) return;
    copyToClipboard(lanIp);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left">
        <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-primary/15 text-primary shrink-0">
          <Router size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">
            Set up on your router
          </div>
          <div className="text-xs text-muted-foreground/80 mt-0.5">
            Point every device on your network at this DNS server.
          </div>
        </div>
        <ChevronDown
          size={16}
          className={`text-muted-foreground/70 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-border/30">
          {/* IP banner */}
          <div className="rounded-lg border border-border/40 bg-background/50 p-3 flex items-center gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-muted-foreground/80">
                This host's LAN IP
              </div>
              <div className="text-base font-mono text-foreground mt-0.5 truncate">
                {lanIp || 'detecting…'}
              </div>
            </div>
            <button
              onClick={copyIp}
              disabled={!lanIp}
              className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/40 px-3 py-1.5 text-xs font-medium text-foreground/85 hover:border-primary/40 disabled:opacity-50">
              {copied ? <CheckCircle2 size={12} /> : null}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <Steps
            steps={[
              {
                title: 'Open your router admin page',
                body: (
                  <>
                    On most ASUS routers it's{' '}
                    <a
                      href="http://router.asus.com"
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-primary hover:underline">
                      router.asus.com
                    </a>{' '}
                    (or <span className="font-mono">192.168.50.1</span>). Sign in with your admin password.
                  </>
                ),
              },
              {
                title: 'Find LAN → DHCP Server',
                body: (
                  <>
                    Navigate to{' '}
                    <span className="font-mono text-foreground/90">
                      LAN → DHCP Server
                    </span>
                    . Scroll to the section labelled{' '}
                    <span className="font-mono text-foreground/90">
                      DNS and WINS Server Setting
                    </span>
                    .
                  </>
                ),
              },
              {
                title: 'Set DNS Server 1 to this host',
                body: (
                  <>
                    Set <span className="font-mono">DNS Server 1</span> to{' '}
                    <code className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      {ip}
                    </code>
                    . Leave <span className="font-mono">DNS Server 2</span> empty
                    (or set it to a public fallback like{' '}
                    <span className="font-mono">1.1.1.1</span> if you'd rather
                    survive Pi reboots without losing the internet).
                  </>
                ),
              },
              {
                title: 'Force-advertise to clients',
                body: (
                  <>
                    Find <span className="font-mono">Advertise router's IP in addition to user-specified DNS</span>{' '}
                    and set it to <span className="font-mono">No</span> — otherwise
                    the router itself will be advertised and queries skip your Pi.
                  </>
                ),
              },
              {
                title: 'Apply and renew leases',
                body: (
                  <>
                    Click <span className="font-mono">Apply</span>. Existing
                    devices keep their old DNS until their lease renews —
                    toggle Wi-Fi off/on or reboot a phone to test sooner.
                  </>
                ),
              },
              {
                title: 'Verify',
                body: (
                  <>
                    From any client run{' '}
                    <code className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      nslookup home.lan
                    </code>{' '}
                    — it should resolve to <span className="font-mono">{ip}</span>.
                    The "Queries" counter below will tick up as devices start using it.
                  </>
                ),
              },
            ]}
          />

          <p className="text-xs text-muted-foreground/75 leading-relaxed pt-1">
            Tip: if your ISP-supplied router doesn't let you set custom DNS,
            you can disable DHCP on it and let this host's network handle DHCP
            instead — or set the DNS manually on each device's Wi-Fi profile.
          </p>
        </div>
      )}
    </div>
  );
}

function Steps({ steps }: { steps: { title: string; body: React.ReactNode }[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full border border-primary/40 bg-primary/10 text-xs font-semibold text-primary tabular-nums">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="text-sm font-medium text-foreground">{s.title}</div>
            <div className="text-xs text-muted-foreground/85 mt-1 leading-relaxed">
              {s.body}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
