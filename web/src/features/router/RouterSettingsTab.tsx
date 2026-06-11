import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Power,
  RefreshCw,
  Router as RouterIcon,
  Save,
  Wifi,
} from 'lucide-react';
import { routerApi, type RouterConfig } from '@/features/router/api';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  SettingsCard,
  SkeletonRows,
} from '@/features/settings/components/SettingsRows';
import { formatUptime } from '@/lib/format';

type TestState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ok'; at: number }
  | { kind: 'err'; msg: string };

/** Settings tab for the ASUS router integration: credentials, status,
 *  connectivity test and a few one-shot actions (reboot / restart radios). */
export function RouterSettingsTab() {
  const [cfg, setCfg] = useState<RouterConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    host: '',
    username: 'admin',
    password: '',
    use_ssl: false,
    port: 0,
    verify_ssl: false,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [statusBusy, setStatusBusy] = useState(false);
  const [status, setStatus] = useState<
    Awaited<ReturnType<typeof routerApi.status>> | null
  >(null);
  const [actionBusy, setActionBusy] = useState<'reboot' | 'wifi' | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const c = await routerApi.config();
    if (c) {
      setCfg(c);
      setForm({
        host: c.host || '',
        username: c.username || 'admin',
        password: '',
        use_ssl: !!c.use_ssl,
        port: c.port || 0,
        verify_ssl: !!c.verify_ssl,
      });
      setDirty(false);
    }
    setLoading(false);
    if (c?.configured) refreshStatus();
  }, []);

  const refreshStatus = useCallback(async () => {
    setStatusBusy(true);
    const s = await routerApi.status();
    setStatus(s);
    setStatusBusy(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onChange = <K extends keyof typeof form>(
    k: K,
    v: (typeof form)[K],
  ) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const onSave = async () => {
    setSaving(true);
    setTest({ kind: 'idle' });
    try {
      // Don't send the literal "********" placeholder back as a password;
      // empty string lets the server keep the previous one.
      const payload = {
        ...form,
        password: form.password === '********' ? '' : form.password,
        port: Number(form.port) || 0,
      };
      await routerApi.saveConfig(payload);
      setForm((f) => ({ ...f, password: '' }));
      setDirty(false);
      await loadAll();
    } catch (e) {
      setTest({ kind: 'err', msg: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    setTest({ kind: 'busy' });
    try {
      await routerApi.test();
      setTest({ kind: 'ok', at: Date.now() });
      refreshStatus();
    } catch (e) {
      setTest({ kind: 'err', msg: (e as Error).message });
    }
  };

  const doReboot = async () => {
    if (
      !window.confirm(
        'Reboot the router? The whole network will drop for ~60 seconds.',
      )
    )
      return;
    setActionBusy('reboot');
    try {
      await routerApi.reboot();
    } catch (e) {
      window.alert('Reboot failed: ' + (e as Error).message);
    } finally {
      setActionBusy(null);
    }
  };

  const doRestartWifi = async () => {
    if (!window.confirm('Restart wireless radios?')) return;
    setActionBusy('wifi');
    try {
      await routerApi.restartWireless();
    } catch (e) {
      window.alert('Restart wireless failed: ' + (e as Error).message);
    } finally {
      setActionBusy(null);
    }
  };

  const s = status?.status;

  const passwordPlaceholder = useMemo(
    () => (cfg?.has_password ? '•••••••• (saved — leave blank to keep)' : ''),
    [cfg?.has_password],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground/90 flex items-center gap-2">
            <RouterIcon size={14} className="text-muted-foreground/70" />
            ASUS Router
          </h2>
          <p className="text-xs text-muted-foreground/70">
            Connects to AsusWRT / Merlin firmware over HTTP(S). Reuses the same
            login as the router web UI.
          </p>
        </div>
        <button
          onClick={loadAll}
          disabled={loading}
          className="text-xs flex items-center gap-1 px-2 py-1 text-muted-foreground/70 hover:text-foreground/80 disabled:opacity-30 transition-colors">
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Credentials ── */}
      <SettingsCard title="Connection" icon={<RouterIcon size={12} />}>
        {loading ? (
          <SkeletonRows rows={4} />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-2.5">
              <Field label="Host or IP">
                <Input
                  value={form.host}
                  onChange={(e) => onChange('host', e.target.value)}
                  placeholder="router.asus.com or 192.168.1.1"
                />
              </Field>
              <Field label="Port (0 = default)">
                <Input
                  type="number"
                  value={form.port || ''}
                  onChange={(e) =>
                    onChange('port', Number(e.target.value) || 0)
                  }
                  placeholder={form.use_ssl ? '443' : '80'}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Field label="Username">
                <Input
                  value={form.username}
                  onChange={(e) => onChange('username', e.target.value)}
                  placeholder="admin"
                />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => onChange('password', e.target.value)}
                  placeholder={passwordPlaceholder}
                />
              </Field>
            </div>
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-muted-foreground/80">
                  <Switch
                    checked={form.use_ssl}
                    onCheckedChange={(v) => onChange('use_ssl', v)}
                  />
                  HTTPS
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground/80">
                  <Switch
                    checked={form.verify_ssl}
                    onCheckedChange={(v) => onChange('verify_ssl', v)}
                  />
                  Verify cert
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onTest}
                  disabled={
                    test.kind === 'busy' || saving || !form.host || dirty
                  }>
                  {test.kind === 'busy' ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Wifi size={12} />
                  )}
                  Test
                </Button>
                <Button
                  size="sm"
                  onClick={onSave}
                  disabled={saving || !dirty || !form.host}>
                  {saving ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Save size={12} />
                  )}
                  Save
                </Button>
              </div>
            </div>
            {test.kind === 'ok' && (
              <p className="text-xs text-emerald-300/80 flex items-center gap-1.5">
                <CheckCircle2 size={11} /> Connected.
              </p>
            )}
            {test.kind === 'err' && (
              <p className="text-xs text-rose-300/80 flex items-center gap-1.5">
                <AlertCircle size={11} /> {test.msg}
              </p>
            )}
          </div>
        )}
      </SettingsCard>

      {/* ── Status ── */}
      <SettingsCard
        title="Router status"
        icon={<Wifi size={12} />}
        actions={
          <button
            onClick={refreshStatus}
            disabled={statusBusy || !cfg?.configured}
            className="text-xs flex items-center gap-1 text-muted-foreground/70 hover:text-foreground/80 disabled:opacity-30">
            <RefreshCw
              size={10}
              className={statusBusy ? 'animate-spin' : ''}
            />
            Refresh
          </button>
        }>
        {!cfg?.configured ? (
          <p className="text-xs text-muted-foreground/70 italic">
            Save credentials first to query status.
          </p>
        ) : !status ? (
          statusBusy ? (
            <SkeletonRows rows={3} />
          ) : (
            <p className="text-xs text-muted-foreground/70 italic">
              No status yet.
            </p>
          )
        ) : !s ? (
          <p className="text-xs text-rose-300/70 italic">
            Could not read status — check credentials.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
            <Stat label="Model" value={s.model || '—'} />
            <Stat label="Firmware" value={s.firmware || '—'} mono />
            <Stat
              label="Uptime"
              value={s.uptime_sec ? formatUptime(s.uptime_sec) : '—'}
            />
            <Stat
              label="WAN"
              value={
                s.wan_status
                  ? `${s.wan_status} · ${s.wan_ip || '—'}`
                  : s.wan_ip || '—'
              }
              mono
              tone={s.wan_status === 'Connected' ? 'good' : undefined}
            />
            <Stat label="LAN IP" value={s.lan_ip || '—'} mono />
            <Stat
              label="Clients"
              value={
                s.client_count != null
                  ? `${s.client_count} (${s.wired_count || 0} wired · ${
                      (s.wireless_2g_count || 0) + (s.wireless_5g_count || 0)
                    } wifi)`
                  : '—'
              }
            />
            <Stat
              label="CPU"
              value={
                s.cpu_used_pct != null ? `${s.cpu_used_pct.toFixed(0)}%` : '—'
              }
            />
            <Stat
              label="Mem"
              value={
                s.mem_used_pct != null ? `${s.mem_used_pct.toFixed(0)}%` : '—'
              }
            />
          </div>
        )}
      </SettingsCard>

      {/* ── Actions ── */}
      <SettingsCard title="Actions" icon={<Power size={12} />}>
        {!cfg?.configured ? (
          <p className="text-xs text-muted-foreground/70 italic">
            Save credentials first.
          </p>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={doRestartWifi}
              disabled={actionBusy !== null}>
              {actionBusy === 'wifi' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Wifi size={12} />
              )}
              Restart wireless
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={doReboot}
              disabled={actionBusy !== null}
              className="text-rose-300 border-rose-500/30 hover:bg-rose-500/10">
              {actionBusy === 'reboot' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Power size={12} />
              )}
              Reboot router
            </Button>
            <span className="text-xs text-muted-foreground/70 ml-auto">
              Changes take effect on the router itself.
            </span>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      {children}
    </label>
  );
}

function Stat({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'good' | 'bad';
}) {
  const color =
    tone === 'good'
      ? 'text-emerald-300/85'
      : tone === 'bad'
        ? 'text-rose-300/85'
        : 'text-foreground/85';
  return (
    <div className="space-y-0.5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground/65">
        {label}
      </div>
      <div className={`${mono ? 'font-mono' : ''} ${color} truncate`}>
        {value}
      </div>
    </div>
  );
}
