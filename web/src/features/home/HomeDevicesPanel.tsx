import { useCallback, useMemo, useState, type DragEvent } from 'react';
import { Home, Plus, Settings } from 'lucide-react';
import { useAuth } from '@/features/auth';
import type { HomeAction, HomeDevice } from '@/features/home/api';
import { DEVICE_MIME } from '@/features/home/deviceMeta';
import {
  ALL_ROOMS,
  HIDDEN_VIEW,
  deriveHomeView,
  roomSummary,
} from '@/features/home/homeView';
import { useHomeDevices } from '@/features/home/hooks/useHomeDevices';
import { ConditionsCard } from '@/features/home/components/ConditionsCard';
import { EditDeviceDialog } from '@/features/home/components/EditDeviceDialog';
import { RoomSection } from '@/features/home/components/RoomSection';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { MasterDetail } from '@/components/ui/master-detail';
import { SkeletonRows } from '@/components/ui/skeleton';
import { plural } from '@/lib/format';
import { gotoPage, pushRoute, useRoute } from '@/lib/routing';

const BRIDGES = '__bridges__';

const openBridgeSettings = () => gotoPage('settings', { tab: 'home' });

/**
 * Smart Home page: devices grouped by room (URL `/home/<room>`), with
 * drag-and-drop room moves, hidden devices and sensor conditions.
 */
export function HomeDevicesPanel() {
  const { sub } = useRoute();
  const isAdmin = useAuth().user?.role === 'admin';
  const { snap, control, setOverride, move } = useHomeDevices();
  const [editing, setEditing] = useState<HomeDevice | null>(null);
  const view = useMemo(
    () => deriveHomeView(snap?.devices ?? [], sub),
    [snap, sub],
  );
  const act = useCallback(
    (d: HomeDevice, a: HomeAction) => void control([d], a),
    [control],
  );

  const groups = [
    {
      label: 'Overview',
      items: [
        {
          id: ALL_ROOMS,
          label: 'All rooms',
          description: `${plural(view.dashboardCount, 'device')} across ${plural(view.rooms.length, 'room')}`,
          count: view.dashboardCount,
        },
      ],
    },
    {
      label: 'Rooms',
      items: view.rooms.map((r) => ({
        id: r.name,
        label: r.name,
        description: roomSummary(r),
        count: r.devices.length + r.sensors.length,
        onDrop: (e: DragEvent) =>
          move(e.dataTransfer.getData(DEVICE_MIME), r.name),
      })),
    },
    {
      label: 'Other',
      items: [
        ...(view.hiddenCount > 0
          ? [
              {
                id: HIDDEN_VIEW,
                label: 'Hidden',
                description: 'Devices excluded from the dashboard',
                count: view.hiddenCount,
              },
            ]
          : []),
        ...(isAdmin
          ? [
              {
                id: BRIDGES,
                label: 'Manage bridges',
                description: 'Add or remove bridges in Settings',
                icon: <Settings />,
              },
            ]
          : []),
      ],
    },
  ];

  const lights = view.hiddenView
    ? []
    : view.shown
        .flatMap((r) => r.devices)
        .filter((d) => d.type === 'light' && d.reachable);
  const rooms = view.shown.filter((r) => r.devices.length > 0);

  return (
    <MasterDetail
      groups={groups}
      activeId={sub}
      defaultId={ALL_ROOMS}
      onSelect={(id) =>
        id === BRIDGES ? openBridgeSettings() : pushRoute('home', id)
      }
      backLabel="Smart home"
      onBack={() => pushRoute('home')}
      title={view.title}
      description={view.description}
      actions={
        lights.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void control(lights, { action: 'on' })}
            >
              Lights on
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void control(lights, { action: 'off' })}
            >
              Lights off
            </Button>
          </div>
        )
      }
    >
      {!snap ? (
        <SkeletonRows rows={4} block />
      ) : snap.bridges.length === 0 ? (
        <EmptyState
          dashed
          icon={<Home />}
          title="No smart home bridges yet"
          description={
            isAdmin
              ? 'Connect Philips Hue, IKEA DIRIGERA, LG webOS or HTTP switches to control them here.'
              : 'Ask an admin to add a bridge.'
          }
          action={
            isAdmin && (
              <Button onClick={openBridgeSettings}>
                <Plus />
                Add a bridge
              </Button>
            )
          }
        />
      ) : (
        <>
          {view.hiddenView && view.hiddenCount > 0 && (
            <Alert tone="info">
              These devices are hidden from the dashboard. Edit one and turn off
              “Hide from dashboard” to bring it back.
            </Alert>
          )}
          {view.sensors.length > 0 && (
            <ConditionsCard sensors={view.sensors} onEdit={setEditing} />
          )}
          {rooms.length === 0 && view.sensors.length === 0 && (
            <EmptyState
              dashed
              title={
                view.hiddenView
                  ? 'Nothing hidden'
                  : sub && sub !== ALL_ROOMS
                    ? `No devices in ${view.title}`
                    : 'No devices yet'
              }
            />
          )}
          {rooms.map((r) => (
            <RoomSection
              key={r.name}
              room={r}
              onAction={act}
              onEdit={setEditing}
              onMove={move}
            />
          ))}
        </>
      )}

      {editing && (
        <EditDeviceDialog
          key={editing.id}
          device={editing}
          rooms={view.roomNames}
          onClose={() => setEditing(null)}
          onSave={(o) => {
            void setOverride(editing, o);
            setEditing(null);
          }}
        />
      )}
    </MasterDetail>
  );
}
