import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import { dnsApi, type BlocklistStatus } from '@/features/dns/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  SettingsCard,
  SkeletonRows,
} from '@/components/ui/settings-rows';

/**
 * Pi-hole-style ad-blocker panel. Manages hosts-format blocklist sources,
 * enables/disables the global block, and surfaces live counters.
 */
export function BlocklistCard() {
  const [status, setStatus] = useState<BlocklistStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [allowDomain, setAllowDomain] = useState('');

  const refresh = useCallback(
    () =>
      dnsApi.blocklist.status().then((s) => {
        if (s) setStatus(s);
      }),
    [],
  );

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, [refresh]);

  const onToggleAll = async (enabled: boolean) => {
    setBusy(true);
    try {
      await dnsApi.blocklist.setEnabled(enabled);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onAdd = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await dnsApi.blocklist.addSource(name.trim() || url.trim(), url.trim());
      setName('');
      setUrl('');
      await dnsApi.blocklist.refresh();
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (sourceUrl: string) => {
    if (!window.confirm(`Remove blocklist source?\n${sourceUrl}`)) return;
    try {
      await dnsApi.blocklist.removeSource(sourceUrl);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const onToggleSource = async (sourceUrl: string, enabled: boolean) => {
    try {
      await dnsApi.blocklist.toggleSource(sourceUrl, enabled);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const onRefreshNow = async () => {
    setBusy(true);
    try {
      await dnsApi.blocklist.refresh();
      // Give the server a moment to start refreshing.
      setTimeout(refresh, 400);
    } finally {
      setBusy(false);
    }
  };

  const onAddAllow = async () => {
    const d = allowDomain.trim();
    if (!d) return;
    setErr(null);
    try {
      await dnsApi.blocklist.addAllow(d);
      setAllowDomain('');
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const onRemoveAllow = async (domain: string) => {
    try {
      await dnsApi.blocklist.removeAllow(domain);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (!status) return <SkeletonRows />;

  return (
    <SettingsCard
      title="Ad-blocker"
      icon={
        status.enabled ? (
          <Shield size={12} className="text-emerald-300/80" />
        ) : (
          <ShieldOff size={12} className="text-muted-foreground/60" />
        )
      }
      actions={
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground/65">
            {status.enabled ? 'on' : 'off'}
          </span>
          <Switch
            checked={status.enabled}
            disabled={busy}
            onCheckedChange={onToggleAll}
          />
          <button
            onClick={onRefreshNow}
            title="Refresh blocklists now"
            disabled={busy || status.refreshing}
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-white/5 disabled:opacity-50">
            <RefreshCw
              size={12}
              className={status.refreshing ? 'animate-spin' : ''}
            />
          </button>
        </div>
      }>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Stat
          label="Domains"
          value={status.blocked_count.toLocaleString()}
          mono
          accent={status.blocked_count > 0 ? 'good' : undefined}
        />
        <Stat label="Blocked hits" value={String(status.blocked_hits)} mono />
        <Stat label="Sources" value={String(status.sources.length)} mono />
        <Stat
          label="Updated"
          value={
            status.last_refreshed
              ? new Date(status.last_refreshed).toLocaleTimeString()
              : '—'
          }
          mono
        />
      </div>

      {err && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-300/85">
          <AlertCircle size={12} /> {err}
        </p>
      )}

      <div className="mt-4 space-y-1">
        {status.sources.length === 0 && (
          <p className="text-xs text-muted-foreground/70 italic">
            No sources yet. Add a hosts-format URL below.
          </p>
        )}
        {status.sources.map((src) => (
          <div
            key={src.url}
            className="flex items-center gap-2 px-2 py-1.5 rounded border border-border/15 bg-background/30 text-xs">
            <Switch
              checked={src.enabled}
              onCheckedChange={(v) => onToggleSource(src.url, v)}
            />
            <div className="flex-1 min-w-0">
              <div className="truncate text-foreground/85">{src.name}</div>
              <div className="truncate text-xs font-mono text-muted-foreground/70">
                {src.url}
              </div>
              {src.last_error && (
                <div className="truncate text-xs text-rose-300/75">
                  {src.last_error}
                </div>
              )}
            </div>
            <span className="font-mono text-muted-foreground/70 text-xs tabular-nums hidden sm:inline">
              {src.entries.toLocaleString()}
            </span>
            <button
              onClick={() => onRemove(src.url)}
              title="Remove source"
              className="p-1 text-rose-300/70 hover:text-rose-200 rounded hover:bg-rose-500/10">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 items-center">
        <Input
          placeholder="name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          placeholder="https://…/hosts"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button onClick={onAdd} disabled={busy || !url.trim()} size="sm">
          {busy ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Plus size={12} />
          )}{' '}
          Add
        </Button>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground/70">
        <CheckCircle2 size={12} /> Blocked queries return{' '}
        <span className="font-mono">NXDOMAIN</span>. Lists auto-refresh every
        24 hours.
      </p>

      {/* Allowlist */}
      <div className="mt-5 pt-4 border-t border-border/15">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs text-foreground/80 font-medium">
            <CheckCircle2 size={12} className="text-emerald-300/70" />
            Allowlist ({status.allowlist?.length ?? 0})
          </div>
          <span className="text-xs text-muted-foreground/70">
            overrides blocklist (suffix-matched)
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {(status.allowlist ?? []).length === 0 ? (
            <span className="text-xs text-muted-foreground/70 italic">
              Empty.
            </span>
          ) : (
            (status.allowlist ?? []).map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-emerald-400/20 bg-emerald-500/5 text-xs font-mono text-emerald-200/85">
                {d}
                <button
                  onClick={() => onRemoveAllow(d)}
                  className="text-emerald-300/60 hover:text-rose-200"
                  title={`Remove ${d}`}>
                  ×
                </button>
              </span>
            ))
          )}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Input
            placeholder="e.g. googlevideo.com"
            value={allowDomain}
            onChange={(e) => setAllowDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAddAllow()}
          />
          <Button onClick={onAddAllow} disabled={!allowDomain.trim()} size="sm">
            <Plus size={12} /> Allow
          </Button>
        </div>
      </div>
    </SettingsCard>
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
    <div className="rounded border border-border/15 bg-background/30 px-2 py-1.5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div className={`${color} ${mono ? 'font-mono' : ''} text-sm`}>
        {value}
      </div>
    </div>
  );
}
