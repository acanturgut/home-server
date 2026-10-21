import { useCallback, useEffect, useState } from 'react';
import { Router, Wifi } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RefreshButton } from '@/components/ui/refresh-button';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { Switch } from '@/components/ui/switch';
import { useAction } from '@/hooks/useAction';
import {
  routerApi,
  type RouterConfig,
  type RouterStatusResp,
} from '@/features/network/api';
import { useRouterActions } from '@/features/network/hooks/useRouterActions';
import { formatUptime } from '@/lib/format';

type Form = {
  host: string;
  username: string;
  password: string;
  use_ssl: boolean;
  port: number;
  verify_ssl: boolean;
};

const formFrom = (c: RouterConfig | null): Form => ({
  host: c?.host || '',
  username: c?.username || 'admin',
  password: '',
  use_ssl: !!c?.use_ssl,
  port: c?.port || 0,
  verify_ssl: !!c?.verify_ssl,
});

const pct = (v: number | undefined) => (v != null ? `${v.toFixed(0)}%` : '—');

/** Settings → Router: ASUS credentials, a connection test, live status and router actions. */
export function RouterSettingsTab() {
  const [cfg, setCfg] = useState<RouterConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Form>(() => formFrom(null));
  const [dirty, setDirty] = useState(false);
  const [testOk, setTestOk] = useState(false);
  const [status, setStatus] = useState<RouterStatusResp | null>(null);

  const fetchStatus = useCallback(
    async () => setStatus(await routerApi.status()),
    [],
  );
  const statusLoad = useAction(fetchStatus);
  const { run: loadStatus } = statusLoad;

  // `.then`, not `await`: the mount effect calls this, and the lint rule
  // only allows setState from a callback there.
  const fetchConfig = useCallback(
    () =>
      routerApi.config().then((c) => {
        if (c) {
          setCfg(c);
          setForm(formFrom(c));
          setDirty(false);
        }
        setLoading(false);
        if (c?.configured) void loadStatus();
      }),
    [loadStatus],
  );

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const save = useAction(async () => {
    setTestOk(false);
    await routerApi.saveConfig({ ...form, port: Number(form.port) || 0 });
    await fetchConfig();
  });
  const test = useAction(async () => {
    setTestOk(false);
    await routerApi.test();
    setTestOk(true);
    void loadStatus();
  });

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
    setTestOk(false);
  };

  const error = save.error ?? test.error;

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <CardHeader
          title="Connection"
          icon={<Router />}
          description="AsusWRT or Merlin firmware over HTTP(S), with the same login as the router's web page."
        />
        {loading ? (
          <SkeletonRows rows={4} />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save.run();
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Host or IP" className="sm:col-span-2">
                <Input
                  value={form.host}
                  onChange={(e) => set('host', e.target.value)}
                  placeholder="router.asus.com or 192.168.1.1"
                />
              </Field>
              <Field label="Port" hint="Empty uses the default">
                <Input
                  type="number"
                  min={0}
                  value={form.port || ''}
                  onChange={(e) => set('port', e.target.valueAsNumber || 0)}
                  placeholder={form.use_ssl ? '443' : '80'}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Username">
                <Input
                  value={form.username}
                  onChange={(e) => set('username', e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder={
                    cfg?.has_password ? 'Leave blank to keep the saved one' : ''
                  }
                  autoComplete="current-password"
                />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  aria-label="HTTPS"
                  checked={form.use_ssl}
                  onCheckedChange={(v) => set('use_ssl', v)}
                />
                HTTPS
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  aria-label="Verify certificate"
                  checked={form.verify_ssl}
                  onCheckedChange={(v) => set('verify_ssl', v)}
                />
                Verify certificate
              </label>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  loading={test.busy}
                  disabled={save.busy || !form.host || dirty}
                  onClick={() => test.run()}
                >
                  Test
                </Button>
                <Button
                  type="submit"
                  loading={save.busy}
                  disabled={!dirty || !form.host}
                >
                  Save
                </Button>
              </div>
            </div>
            {error && <Alert>{error}</Alert>}
            {testOk && <Alert tone="success">Connected to the router.</Alert>}
          </form>
        )}
      </Card>

      <StatusCard
        configured={!!cfg?.configured}
        status={status}
        busy={statusLoad.busy}
        onRefresh={loadStatus}
      />
    </div>
  );
}

function StatusCard({
  configured,
  status,
  busy,
  onRefresh,
}: {
  configured: boolean;
  status: RouterStatusResp | null;
  busy: boolean;
  onRefresh: () => void;
}) {
  const actions = useRouterActions();
  const s = status?.status;
  return (
    <Card className="space-y-4">
      <CardHeader
        title="Status"
        icon={<Wifi />}
        actions={
          configured && <RefreshButton onClick={onRefresh} busy={busy} />
        }
      />
      {!configured ? (
        <EmptyState
          title="Not connected"
          description="Save the router's login to see its status."
          className="py-6"
        />
      ) : !s ? (
        busy ? (
          <SkeletonRows rows={3} />
        ) : (
          <Alert>Couldn't read the router's status. Check the login.</Alert>
        )
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Model" value={s.model || '—'} />
            <StatTile label="Firmware" value={s.firmware || '—'} mono />
            <StatTile
              label="Uptime"
              value={s.uptime_sec ? formatUptime(s.uptime_sec) : '—'}
            />
            <StatTile
              label="WAN"
              value={s.wan_status || '—'}
              sub={s.wan_ip}
              tone={
                s.wan_status?.toLowerCase() === 'connected'
                  ? 'success'
                  : undefined
              }
            />
            <StatTile label="LAN IP" value={s.lan_ip || '—'} mono />
            <StatTile
              label="Clients"
              value={s.client_count ?? '—'}
              sub={
                s.client_count != null
                  ? `${s.wired_count || 0} wired · ${(s.wireless_2g_count || 0) + (s.wireless_5g_count || 0)} Wi-Fi`
                  : undefined
              }
            />
            <StatTile label="CPU" value={pct(s.cpu_used_pct)} />
            <StatTile label="Memory" value={pct(s.mem_used_pct)} />
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              variant="outline"
              loading={actions.busy === 'wifi'}
              disabled={actions.busy !== null}
              onClick={actions.restartWifi}
            >
              Restart Wi-Fi
            </Button>
            <Button
              variant="destructive"
              loading={actions.busy === 'reboot'}
              disabled={actions.busy !== null}
              onClick={actions.reboot}
            >
              Reboot router
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
