import { useMemo, useState } from 'react';
import {
  Globe,
  MoreHorizontal,
  Power,
  Settings,
  Timer,
  Users,
  Wifi,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Menu } from '@/components/ui/menu';
import { RefreshButton } from '@/components/ui/refresh-button';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { Switch } from '@/components/ui/switch';
import { useAction } from '@/hooks/useAction';
import { deviceLabel, type RouterClient } from '@/features/network/api';
import { DeviceRow } from '@/features/network/components/DeviceRow';
import { RenameDialog } from '@/features/network/components/RenameDialog';
import { useRouterActions } from '@/features/network/hooks/useRouterActions';
import { useRouterClients } from '@/features/network/hooks/useRouterClients';
import { formatUptime, plural } from '@/lib/format';
import { gotoPage } from '@/lib/routing';

const IFACE_RANK: Record<string, number> = {
  wired: 0,
  '6G': 0,
  '5G': 1,
  '5G-2': 1,
  '2G': 2,
};

/** Online first, then wired → 5 GHz → 2.4 GHz, then by name; narrowed by `query`. */
function visibleDevices(
  clients: RouterClient[],
  query: string,
  showOffline: boolean,
): RouterClient[] {
  const q = query.trim().toLowerCase();
  const rank = (c: RouterClient) => IFACE_RANK[c.iface ?? ''] ?? 9;
  return clients
    .filter((c) => showOffline || c.online)
    .filter(
      (c) =>
        !q ||
        [c.custom_name, c.nickname, c.hostname, c.vendor, c.ip, c.mac]
          .join(' ')
          .toLowerCase()
          .includes(q),
    )
    .sort(
      (a, b) =>
        Number(b.online) - Number(a.online) ||
        rank(a) - rank(b) ||
        deviceLabel(a).localeCompare(deviceLabel(b), undefined, {
          sensitivity: 'base',
        }),
    );
}

/** Network page: router status and controls above the list of connected devices. */
export function NetworkPage() {
  const {
    router,
    clients,
    loading,
    reload,
    busyMac,
    toggleBlock,
    wake,
    rename,
  } = useRouterClients();
  const routerActions = useRouterActions();
  const refresh = useAction(reload);
  const [query, setQuery] = useState('');
  const [showOffline, setShowOffline] = useState(true);
  const [renaming, setRenaming] = useState<RouterClient | null>(null);

  const devices = useMemo(
    () => visibleDevices(clients ?? [], query, showOffline),
    [clients, query, showOffline],
  );

  if (loading) return <SkeletonRows rows={4} block />;

  if (!router?.configured) {
    return (
      <EmptyState
        icon={<Wifi />}
        title="Connect your router"
        description="Add your ASUS router's login to see WAN status, connected devices and per-device controls."
        action={
          <Button onClick={() => gotoPage('settings', { tab: 'router' })}>
            <Settings />
            Configure router
          </Button>
        }
      />
    );
  }

  const rs = router.status;
  const online = clients?.filter((c) => c.online).length ?? 0;

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <CardHeader
          icon={<Wifi />}
          title={rs?.model || 'Router'}
          description={[rs?.firmware, rs?.lan_ip].filter(Boolean).join(' · ')}
          actions={
            <>
              <RefreshButton onClick={refresh.run} busy={refresh.busy} />
              <Menu
                trigger={
                  <IconButton
                    icon={<MoreHorizontal />}
                    label="Router actions"
                    disabled={routerActions.busy !== null}
                  />
                }
                items={[
                  {
                    label: 'Restart Wi-Fi',
                    icon: <Wifi />,
                    onSelect: routerActions.restartWifi,
                  },
                  {
                    label: 'Reboot router',
                    icon: <Power />,
                    onSelect: routerActions.reboot,
                    destructive: true,
                  },
                ]}
              />
            </>
          }
        />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile
            label="Internet"
            icon={<Globe />}
            value={rs?.wan_status || '—'}
            tone={
              rs?.wan_status?.toLowerCase() === 'connected'
                ? 'success'
                : 'warning'
            }
          />
          <StatTile
            label="Public IP"
            icon={<Globe />}
            value={rs?.wan_ip || '—'}
            mono
          />
          <StatTile
            label="Uptime"
            icon={<Timer />}
            value={rs?.uptime_sec ? formatUptime(rs.uptime_sec) : '—'}
          />
          <StatTile
            label="Devices online"
            icon={<Users />}
            value={`${online} of ${clients?.length ?? 0}`}
          />
        </div>
      </Card>

      <Card className="p-0">
        <div className="space-y-3 p-4">
          <CardHeader
            icon={<Users />}
            title="Devices"
            description={
              query.trim()
                ? `${devices.length} matching`
                : plural(devices.length, 'device')
            }
            actions={
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Show offline
                <Switch
                  aria-label="Show offline devices"
                  checked={showOffline}
                  onCheckedChange={setShowOffline}
                />
              </label>
            }
          />
          <Input
            type="search"
            aria-label="Search devices"
            placeholder="Search by name, IP or MAC…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {devices.length === 0 ? (
          <EmptyState
            title={query.trim() ? 'No matching devices' : 'No devices yet'}
            description={
              query.trim()
                ? 'Try a different name, IP or MAC.'
                : "The router hasn't reported any devices."
            }
          />
        ) : (
          <ul className="space-y-0.5">
            {devices.map((c) => (
              <DeviceRow
                key={c.mac}
                client={c}
                busy={busyMac === c.mac}
                onToggleBlock={() => toggleBlock(c)}
                onWake={() => wake(c)}
                onRename={() => setRenaming(c)}
              />
            ))}
          </ul>
        )}
      </Card>

      <RenameDialog
        key={renaming?.mac}
        client={renaming}
        onClose={() => setRenaming(null)}
        onRename={rename}
      />
    </div>
  );
}
