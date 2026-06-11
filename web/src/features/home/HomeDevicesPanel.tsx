import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Lightbulb,
  Plug,
  Tv,
  Speaker,
  Activity,
  Power,
  Thermometer,
  Battery,
  Droplets,
  Wind,
  Settings as SettingsIcon,
  Blinds,
  Radio,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  Square,
  Pencil,
  GripVertical,
  Home,
  X,
  Check,
} from 'lucide-react';
import {
  homeApi,
  type HomeDevice,
  type HomeDeviceType,
  type HomeSnapshot,
} from '@/features/home/api';
import { dashboardApi } from '@/features/dashboard/api';
import { gotoPage } from '@/lib/format';
import { useRoute, pushRoute, useIsMobile } from '@/app/routing';
import { ConditionsCard } from '@/features/home/components/ConditionsCard';

// Single source of truth for icon + label + accent colour per device type.
const TYPE_META: Record<
  HomeDeviceType,
  { icon: React.ReactNode; label: string; accent: string }
> = {
  light: { icon: <Lightbulb size={13} />, label: 'Lights', accent: '#f5b942' },
  plug: { icon: <Plug size={13} />, label: 'Plugs', accent: '#22d3ee' },
  blind: { icon: <Blinds size={13} />, label: 'Blinds', accent: '#94d3a2' },
  remote: { icon: <Radio size={13} />, label: 'Remotes', accent: '#a78bfa' },
  sensor: { icon: <Activity size={13} />, label: 'Sensors', accent: '#a78bfa' },
  tv: { icon: <Tv size={13} />, label: 'TVs', accent: '#60a5fa' },
  speaker: {
    icon: <Speaker size={13} />,
    label: 'Speakers',
    accent: '#f472b6',
  },
  other: { icon: <Power size={13} />, label: 'Other', accent: '#94a3b8' },
};

// Order in which device-type sections render within each room. Sensors are
// surfaced separately in the top "Conditions" band (room readings at a glance)
// and intentionally skipped here.
const TYPE_ORDER: HomeDeviceType[] = [
  'light',
  'blind',
  'plug',
  'tv',
  'speaker',
  'remote',
  'other',
];

const UNASSIGNED_ROOM = 'Unassigned';

type ActionFn = (
  dev: HomeDevice,
  action: 'on' | 'off' | 'brightness' | 'position' | 'stop',
  value?: number,
) => void;

type Tab = 'active' | 'hidden';

/** Preferred display string for a device — user override wins. */
function deviceLabel(d: HomeDevice): string {
  return (d.display_name?.trim() || d.name || d.local_id || 'Unnamed').trim();
}

/**
 * Dashboard Smart Home panel — controls grouped by room (not bridge), with
 * drag-and-drop room reassignment, hide/unhide, and offline parking.
 * Add/edit/remove of bridges still lives under Settings → Smart Home.
 */
export function HomeDevicesPanel() {
  const route = useRoute();
  const isMobile = useIsMobile();
  const [snap, setSnap] = useState<HomeSnapshot>({
    devices: [],
    bridges: [],
    last_updated: '',
  });
  const optimisticUntil = useRef<Record<string, number>>({});
  const inFlight = useRef(0);
  const [tab, setTab] = useState<Tab>('active');
  const [editing, setEditing] = useState<HomeDevice | null>(null);

  // Sub-route is the selected room (or '__hidden__'). Empty = master list on
  // mobile, all-rooms on desktop. Encoded in the URL so links/back work.
  const urlSub = route.sub;
  const selectedRoom: string = urlSub === '__hidden__' ? 'all' : (urlSub ?? 'all');
  const setSelectedRoom = useCallback((r: string) => {
    if (r === 'all') pushRoute('home', 'all');
    else pushRoute('home', r);
  }, []);
  // Hidden view rides on the same sub-route slot.
  useEffect(() => {
    if (urlSub === '__hidden__') setTab('hidden');
    else setTab('active');
  }, [urlSub]);
  const showMaster = !isMobile || !urlSub;
  const showDetail = !isMobile || !!urlSub;

  const mergeSnap = useCallback((incoming: HomeSnapshot) => {
    setSnap((prev) => {
      const now = Date.now();
      const overlay = new Map(prev.devices.map((d) => [d.id, d]));
      const merged = incoming.devices.map((d) => {
        const until = optimisticUntil.current[d.id] ?? 0;
        if (until > now) {
          const local = overlay.get(d.id);
          if (local) {
            return {
              ...d,
              on: local.on,
              brightness: local.brightness,
              position: local.position,
            };
          }
        }
        return d;
      });
      return { ...incoming, devices: merged };
    });
  }, []);

  const load = useCallback(async () => {
    if (inFlight.current > 0) return;
    const d = await homeApi.list();
    if (d) mergeSnap(d);
  }, [mergeSnap]);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const onAction = useCallback<ActionFn>(
    async (dev, action, value) => {
      // Optimistic update.
      setSnap((prev) => ({
        ...prev,
        devices: prev.devices.map((x) => {
          if (x.id !== dev.id) return x;
          if (action === 'brightness') {
            return {
              ...x,
              brightness: value ?? x.brightness,
              on: (value ?? 0) > 0,
            };
          }
          if (action === 'position') {
            return { ...x, position: value ?? x.position };
          }
          return { ...x, on: action === 'on' };
        }),
      }));
      optimisticUntil.current[dev.id] = Date.now() + 4000;
      inFlight.current += 1;
      try {
        const payload =
          action === 'brightness'
            ? { action: 'brightness' as const, brightness: value ?? 0 }
            : action === 'position'
              ? { action: 'position' as const, position: value ?? 0 }
              : action === 'stop'
                ? { action: 'stop' as const }
                : { action };
        await homeApi.apply(dev.id, payload);
      } catch (e) {
        console.error('home action failed', e);
        optimisticUntil.current[dev.id] = 0;
      } finally {
        inFlight.current = Math.max(0, inFlight.current - 1);
        const fresh = await homeApi.list();
        if (fresh) mergeSnap(fresh);
      }
    },
    [mergeSnap],
  );

  // Persist a device override (name/room/type/hidden) and update local state.
  const setOverride = useCallback(
    async (
      dev: HomeDevice,
      patch: { name?: string; room?: string; type?: string; hidden?: boolean },
    ) => {
      // Optimistic local update.
      setSnap((prev) => ({
        ...prev,
        devices: prev.devices.map((x) =>
          x.id === dev.id
            ? {
                ...x,
                display_name:
                  patch.name !== undefined ? patch.name : x.display_name,
                room: patch.room !== undefined ? patch.room : x.room,
                type: (patch.type as HomeDeviceType) ?? x.type,
                hidden: patch.hidden !== undefined ? patch.hidden : x.hidden,
              }
            : x,
        ),
      }));
      try {
        await dashboardApi.setDeviceOverride(dev.id, {
          name: patch.name,
          room: patch.room ?? dev.room ?? '',
          type: patch.type,
          hidden: patch.hidden,
        });
      } catch (e) {
        console.error('set override failed', e);
        load();
      }
    },
    [load],
  );

  const totals = useMemo(() => {
    let on = 0;
    let reachable = 0;
    let controllable = 0;
    let hidden = 0;
    snap.devices.forEach((d) => {
      if (d.hidden) hidden += 1;
      if (d.type === 'light' || d.type === 'plug') {
        controllable += 1;
        if (d.on) on += 1;
      }
      if (d.reachable) reachable += 1;
    });
    return {
      on,
      controllable,
      reachable,
      hidden,
      total: snap.devices.length,
      offline: snap.devices.length - reachable,
    };
  }, [snap.devices]);

  // Filter devices for the current tab. 'active' now keeps offline devices
  // in place — they render dimmed via CardShell so the room layout stays
  // stable; 'hidden' shows everything the user explicitly hid.
  const visible = useMemo(() => {
    return snap.devices.filter((d) => {
      if (tab === 'hidden') return !!d.hidden;
      return !d.hidden;
    });
  }, [snap.devices, tab]);

  // Sensors live in their own top band (not per room).
  const sensors = useMemo(
    () =>
      visible
        .filter((d) => d.type === 'sensor')
        .sort((a, b) => deviceLabel(a).localeCompare(deviceLabel(b))),
    [visible],
  );

  // Group visible non-sensor devices by room.
  const grouped = useMemo(() => {
    const out = new Map<string, HomeDevice[]>();
    visible.forEach((d) => {
      if (d.type === 'sensor') return;
      const room = d.room?.trim() || UNASSIGNED_ROOM;
      const arr = out.get(room) || [];
      arr.push(d);
      out.set(room, arr);
    });
    // Sort rooms: known names alphabetically, "Unassigned" last.
    return Array.from(out.entries()).sort(([a], [b]) => {
      if (a === UNASSIGNED_ROOM) return 1;
      if (b === UNASSIGNED_ROOM) return -1;
      return a.localeCompare(b);
    });
  }, [visible]);

  // Distinct room names available across all (not just visible) devices —
  // used in the edit dialog's quick-pick list.
  const allRooms = useMemo(() => {
    const s = new Set<string>();
    snap.devices.forEach((d) => {
      const r = d.room?.trim();
      if (r) s.add(r);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [snap.devices]);

  // Bulk lights — only act on reachable lights to avoid spamming dead bridges.
  const allLightsAction = useCallback(
    async (turnOn: boolean) => {
      const targets = snap.devices.filter(
        (d) => d.type === 'light' && d.reachable && !d.hidden,
      );
      const now = Date.now();
      targets.forEach((d) => {
        optimisticUntil.current[d.id] = now + 4000;
      });
      setSnap((prev) => ({
        ...prev,
        devices: prev.devices.map((x) =>
          x.type === 'light' && x.reachable && !x.hidden
            ? { ...x, on: turnOn }
            : x,
        ),
      }));
      inFlight.current += 1;
      try {
        await Promise.allSettled(
          targets.map((d) =>
            homeApi.apply(d.id, { action: turnOn ? 'on' : 'off' }),
          ),
        );
      } finally {
        inFlight.current = Math.max(0, inFlight.current - 1);
        const fresh = await homeApi.list();
        if (fresh) mergeSnap(fresh);
      }
    },
    [snap.devices, mergeSnap],
  );

  // ── Sidebar groups (mirrors Settings page UX) ──
  const roomItems = grouped.map(([name, ds]) => ({ name, count: ds.length }));
  const totalActive = totals.total - totals.hidden;

  // Resolved view derived from sidebar selection.
  const isHiddenView = tab === 'hidden';
  const isAllRooms = selectedRoom === 'all';
  const visibleRooms = grouped.filter(
    ([room]) => isAllRooms || room === selectedRoom,
  );
  const sensorsForView = (() => {
    if (isAllRooms) return sensors;
    return sensors.filter(
      (s) => (s.room?.trim() || UNASSIGNED_ROOM) === selectedRoom,
    );
  })();

  // Header copy for the active view.
  let viewTitle = 'All rooms';
  let viewDescription =
    totals.controllable > 0
      ? `${totals.on}/${totals.controllable} on · ${totals.reachable}/${totals.total} reachable`
      : `${totals.reachable}/${totals.total} reachable`;
  if (isHiddenView) {
    viewTitle = 'Hidden devices';
    viewDescription = `${totals.hidden} device${totals.hidden === 1 ? '' : 's'} hidden from the dashboard`;
  } else if (!isAllRooms) {
    const roomDevices = grouped.find(([r]) => r === selectedRoom)?.[1] ?? [];
    const roomSensors = sensorsForView.length;
    viewTitle = selectedRoom;
    viewDescription = `${roomDevices.length} device${roomDevices.length === 1 ? '' : 's'}${roomSensors ? ` · ${roomSensors} sensor${roomSensors === 1 ? '' : 's'}` : ''}`;
  }

  // Drop-on-sidebar reassignment.
  const reassignDevice = (deviceId: string, newRoom: string) => {
    const dev = snap.devices.find((d) => d.id === deviceId);
    if (!dev) return;
    if ((dev.room?.trim() || UNASSIGNED_ROOM) === newRoom) return;
    setOverride(dev, { room: newRoom === UNASSIGNED_ROOM ? '' : newRoom });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 max-w-6xl">
      {/* ── Sidebar (Settings-style grouped vertical nav) ── */}
      {showMaster && (
        <aside className="w-full lg:w-64 shrink-0 space-y-5 lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
          {/* Overview group */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 px-1">
              Overview
            </div>
            <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden divide-y divide-border/30">
              <SidebarItem
                active={!isMobile && isAllRooms}
                onClick={() => setSelectedRoom('all')}
                label="All rooms"
                description={`${totalActive} device${totalActive === 1 ? '' : 's'} across ${roomItems.length} room${roomItems.length === 1 ? '' : 's'}`}
                count={totalActive + sensors.length}
              />
            </div>
          </div>

          {/* Rooms group */}
          {roomItems.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 px-1">
                Rooms
              </div>
              <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden divide-y divide-border/30">
                {roomItems.map((r) => {
                  const roomSensorCount = sensors.filter(
                    (s) =>
                      (s.room?.trim() || UNASSIGNED_ROOM) === r.name,
                  ).length;
                  return (
                    <SidebarItem
                      key={r.name}
                      active={!isMobile && !isHiddenView && selectedRoom === r.name}
                      onClick={() => setSelectedRoom(r.name)}
                      label={r.name}
                      description={`${r.count} device${r.count === 1 ? '' : 's'}${roomSensorCount ? ` · ${roomSensorCount} sensor${roomSensorCount === 1 ? '' : 's'}` : ''}`}
                      count={r.count}
                      onDropDevice={(id) => reassignDevice(id, r.name)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Other group — hidden devices + jump to Settings */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 px-1">
              Other
            </div>
            <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden divide-y divide-border/30">
              {totals.hidden > 0 && (
                <SidebarItem
                  active={!isMobile && isHiddenView}
                  onClick={() => pushRoute('home', '__hidden__')}
                  label="Hidden"
                  description="Devices excluded from the dashboard"
                  count={totals.hidden}
                />
              )}
              <SidebarItem
                active={false}
                onClick={() => gotoPage('settings', { tab: 'home' })}
                label="Manage bridges"
                description="Add or remove bridges under Settings"
                icon={<SettingsIcon size={12} />}
              />
            </div>
          </div>
        </aside>
      )}

      {/* ── Active view body ── */}
      {showDetail && (
        <div className="flex-1 min-w-0 space-y-5">
          <header className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              {isMobile && (
                <button
                  onClick={() => pushRoute('home')}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground/80 hover:text-foreground transition-colors -ml-1">
                  <ChevronLeft size={14} />
                  Smart Home
                </button>
              )}
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 truncate">
                <Home size={16} className="text-amber-300/85 shrink-0" />
                <span className="truncate">{viewTitle}</span>
              </h2>
              <p className="text-sm text-muted-foreground/80">
                {viewDescription}
              </p>
            </div>
            {!isHiddenView && totals.total > 0 && (
              <div className="flex items-center gap-1.5 text-xs shrink-0">
                <span className="text-muted-foreground/80 hidden sm:inline">
                  All lights:
                </span>
                <BulkBtn label="On" onClick={() => allLightsAction(true)} />
                <BulkBtn label="Off" onClick={() => allLightsAction(false)} />
              </div>
            )}
          </header>

        {snap.bridges.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card/40 p-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground/80">
              No smart-home bridges yet.
            </p>
            <button
              onClick={() => gotoPage('settings', { tab: 'home' })}
              className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-primary/30 bg-primary/10 hover:bg-primary/15 text-primary transition-colors">
              <SettingsIcon size={12} />
              Add a bridge
            </button>
          </div>
        ) : (
          <>
            {/* Unified Conditions card — current readings + history + insights */}
            {sensorsForView.length > 0 && (
              <ConditionsCard
                sensors={sensorsForView}
                onEdit={setEditing}
              />
            )}

            {/* Hidden view — explainer banner above the actual list */}
            {isHiddenView && totals.hidden > 0 && (
              <div className="rounded-xl border border-border/40 bg-card/40 p-3">
                <p className="text-xs text-muted-foreground/75">
                  These devices are hidden from the main view. Open one with
                  the pencil icon and uncheck <em>Hide from main view</em> to
                  restore it.
                </p>
              </div>
            )}
            {isHiddenView && totals.hidden === 0 && (
              <p className="text-sm text-muted-foreground/80 italic text-center py-10">
                Nothing hidden.
              </p>
            )}

            {/* Active rooms / single room */}
            {!isHiddenView && visibleRooms.length === 0 && sensorsForView.length === 0 && (
              <p className="text-sm text-muted-foreground/80 italic text-center py-10">
                {isAllRooms
                  ? 'No devices yet — add a bridge under Settings.'
                  : `No controllable devices in ${selectedRoom}.`}
              </p>
            )}

            {visibleRooms.map(([room, devices]) => (
              <RoomSection
                key={room}
                room={room}
                devices={devices}
                onAction={onAction}
                onEdit={setEditing}
                onDropToRoom={reassignDevice}
              />
            ))}
          </>
        )}
        </div>
      )}

      {editing && (
        <EditDeviceDialog
          device={editing}
          rooms={allRooms}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            setOverride(editing, patch);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** Settings-style sidebar entry with optional drag-drop target for room reassignment. */
function SidebarItem({
  active,
  onClick,
  label,
  description,
  count,
  icon,
  onDropDevice,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  description?: string;
  count?: number;
  icon?: React.ReactNode;
  onDropDevice?: (deviceId: string) => void;
}) {
  const [dropHover, setDropHover] = useState(false);
  const acceptsDrop = !!onDropDevice;
  return (
    <button
      onClick={onClick}
      onDragOver={
        acceptsDrop
          ? (e) => {
              e.preventDefault();
              setDropHover(true);
            }
          : undefined
      }
      onDragLeave={acceptsDrop ? () => setDropHover(false) : undefined}
      onDrop={
        acceptsDrop
          ? (e) => {
              e.preventDefault();
              setDropHover(false);
              const id = e.dataTransfer.getData('text/x-device-id');
              if (id && onDropDevice) onDropDevice(id);
            }
          : undefined
      }
      className={`w-full text-left px-3 py-2.5 transition-colors flex items-start gap-2 ${
        active
          ? 'bg-primary/10 text-foreground'
          : dropHover
            ? 'bg-primary/6 text-foreground'
            : 'text-foreground/85 hover:bg-white/5'
      }`}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-1.5">
          {icon}
          <span className="truncate">{label}</span>
        </div>
        {description && (
          <div className="text-xs text-muted-foreground/75 mt-0.5 truncate">
            {description}
          </div>
        )}
      </div>
      {count !== undefined && (
        <span
          className={`text-xs tabular-nums shrink-0 mt-0.5 ${
            active ? 'text-primary' : 'text-muted-foreground/70'
          }`}>
          {count}
        </span>
      )}
    </button>
  );
}

function BulkBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-0.5 rounded border border-border/25 hover:border-border/50 hover:bg-white/[0.04] text-muted-foreground/80 hover:text-foreground/95 transition-colors">
      {label}
    </button>
  );
}

// One room — grouped by device type internally so toggles cluster together.
function RoomSection({
  room,
  devices,
  onAction,
  onEdit,
  onDropToRoom,
}: {
  room: string;
  devices: HomeDevice[];
  onAction: ActionFn;
  onEdit: (d: HomeDevice) => void;
  onDropToRoom: (deviceId: string, room: string) => void;
}) {
  const [hover, setHover] = useState(false);

  const grouped = useMemo(() => {
    const out: Partial<Record<HomeDeviceType, HomeDevice[]>> = {};
    devices.forEach((d) => {
      (out[d.type] ||= []).push(d);
    });
    Object.values(out).forEach((arr) =>
      arr?.sort((a, b) => deviceLabel(a).localeCompare(deviceLabel(b))),
    );
    return out;
  }, [devices]);

  return (
    <div
      className={`space-y-2.5 rounded-md transition-colors ${
        hover ? 'bg-primary/[0.04] outline outline-1 outline-primary/30' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        const id = e.dataTransfer.getData('text/x-device-id');
        if (id) onDropToRoom(id, room);
      }}>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-foreground/85 font-medium">{room}</span>
        <span className="text-muted-foreground/65 tabular-nums text-xs">
          · {devices.length}
        </span>
        <div className="flex-1 h-px bg-border/15" />
      </div>

      <div className="space-y-3">
        {TYPE_ORDER.filter((t) => grouped[t]?.length).map((type) => (
          <DeviceTypeGroup
            key={type}
            type={type}
            devices={grouped[type] || []}
            onAction={onAction}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  );
}

function EditDeviceDialog({
  device,
  rooms,
  onClose,
  onSave,
}: {
  device: HomeDevice;
  rooms: string[];
  onClose: () => void;
  onSave: (patch: {
    name?: string;
    room?: string;
    type?: string;
    hidden?: boolean;
  }) => void;
}) {
  // We default the input to the current display name (override) if any,
  // otherwise the bridge-reported name — lets the user edit in place.
  const [name, setName] = useState(device.display_name ?? device.name ?? '');
  const [room, setRoom] = useState(device.room ?? '');
  const [type, setType] = useState<HomeDeviceType>(device.type);
  const [hidden, setHidden] = useState<boolean>(!!device.hidden);
  const original = device.name ?? '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-border/40 bg-card shadow-xl p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground/95 truncate">
              {deviceLabel(device)}
            </div>
            <div className="text-xs text-muted-foreground/65 truncate">
              {original} · {device.bridge_kind}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground/60 hover:text-foreground/90">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-wider text-muted-foreground/70">
            Display name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={original || 'e.g. Reading lamp'}
            className="w-full px-2.5 py-1.5 text-xs rounded border border-border/30 bg-background/50 focus:outline-none focus:border-primary/50"
          />
          {original && name.trim() !== original && (
            <button
              type="button"
              onClick={() => setName(original)}
              className="text-xs text-muted-foreground/70 hover:text-foreground/85">
              Reset to original “{original}”
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-wider text-muted-foreground/70">
            Room
          </label>
          <input
            type="text"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="e.g. Living room"
            className="w-full px-2.5 py-1.5 text-xs rounded border border-border/30 bg-background/50 focus:outline-none focus:border-primary/50"
          />
          {rooms.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {rooms.map((r) => (
                <button
                  key={r}
                  onClick={() => setRoom(r)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    room === r
                      ? 'border-primary/50 bg-primary/15 text-foreground'
                      : 'border-border/25 text-muted-foreground/70 hover:text-foreground/90 hover:border-border/50'
                  }`}>
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-wider text-muted-foreground/70">
            Type
          </label>
          <div className="grid grid-cols-4 gap-1">
            {(
              [
                'light',
                'plug',
                'blind',
                'sensor',
                'tv',
                'speaker',
                'remote',
                'other',
              ] as HomeDeviceType[]
            ).map((t) => {
              const meta = TYPE_META[t];
              const active = type === t;
              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex items-center justify-center gap-1 text-xs px-1.5 py-1 rounded border transition-colors ${
                    active
                      ? 'border-primary/50 bg-primary/15 text-foreground'
                      : 'border-border/25 text-muted-foreground/70 hover:text-foreground/90 hover:border-border/50'
                  }`}>
                  <span style={{ color: meta.accent }}>{meta.icon}</span>
                  <span className="capitalize">{t}</span>
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground/85 select-none pt-1">
          <input
            type="checkbox"
            checked={hidden}
            onChange={(e) => setHidden(e.target.checked)}
            className="accent-primary"
          />
          Hide from main view
        </label>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1 rounded border border-border/30 text-muted-foreground/80 hover:text-foreground hover:border-border/60">
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                // empty string clears the override on the backend
                name: name.trim() === original.trim() ? '' : name.trim(),
                room: room.trim(),
                type,
                hidden,
              })
            }
            className="text-xs px-3 py-1 rounded border border-primary/40 bg-primary/15 text-primary hover:bg-primary/25 flex items-center gap-1">
            <Check size={11} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

function DeviceTypeGroup({
  type,
  devices,
  onAction,
  onEdit,
}: {
  type: HomeDeviceType;
  devices: HomeDevice[];
  onAction: ActionFn;
  onEdit: (d: HomeDevice) => void;
}) {
  const meta = TYPE_META[type];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground/70 px-0.5">
        <span style={{ color: meta.accent }}>{meta.icon}</span>
        <span>{meta.label}</span>
        <span className="text-muted-foreground/30">· {devices.length}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5">
        {devices.map((d) => (
          <DraggableDeviceCard
            key={d.id}
            d={d}
            onAction={onAction}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  );
}

// Drag wrapper around the per-type DeviceCard. Adds a tiny grip + edit button
// on hover so the card itself stays minimal.
function DraggableDeviceCard({
  d,
  onAction,
  onEdit,
}: {
  d: HomeDevice;
  onAction: ActionFn;
  onEdit: (d: HomeDevice) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/x-device-id', d.id);
      }}
      className="relative group">
      <div className="absolute top-1 left-1 z-10 hidden lg:block opacity-0 group-hover:opacity-60 transition-opacity cursor-grab active:cursor-grabbing">
        <GripVertical size={10} className="text-muted-foreground" />
      </div>
      <button
        onClick={() => onEdit(d)}
        title="Edit"
        className="absolute top-1 right-1 z-10 opacity-60 sm:opacity-0 sm:group-hover:opacity-70 hover:!opacity-100 transition-opacity p-1 rounded bg-background/60 text-muted-foreground hover:text-foreground">
        <Pencil size={10} />
      </button>
      <DeviceCard d={d} onAction={onAction} />
    </div>
  );
}

function DeviceCard({ d, onAction }: { d: HomeDevice; onAction: ActionFn }) {
  switch (d.type) {
    case 'light':
      return <LightCard d={d} onAction={onAction} />;
    case 'blind':
      return <BlindCard d={d} onAction={onAction} />;
    case 'plug':
      return <PlugCard d={d} onAction={onAction} />;
    case 'remote':
    case 'sensor':
    case 'tv':
    case 'speaker':
      return <InfoCard d={d} />;
    default:
      return <PlugCard d={d} onAction={onAction} />;
  }
}

// ─── Shared card chrome ────────────────────────────────────────────────────
// Three visual states with strong contrast so the user can read state at a
// glance without parsing labels:
//   • offline : dashed muted border, ~40% opacity, neutral background
//   • idle    : faint border, plain card background
//   • on/active: NO border — just a subtle accent-tinted background wash
function CardShell({
  d,
  active,
  accent,
  children,
}: {
  d: HomeDevice;
  active: boolean;
  accent?: string;
  children: React.ReactNode;
}) {
  const offline = !d.reachable;
  // Active = borderless wash. We tint the card background with ~10% of the
  // device accent colour so it reads as "on" without a hard frame around it.
  const style: React.CSSProperties =
    active && accent && !offline
      ? { backgroundColor: `${accent}1A` } // ~10% alpha
      : {};
  return (
    <div
      className={`group relative rounded-xl p-3 transition-all duration-150 ${
        offline
          ? 'border border-dashed border-border/40 bg-card/20 opacity-60'
          : active
            ? 'border border-transparent'
            : 'border border-border/40 bg-card/40 hover:border-border/60 hover:bg-card/60'
      }`}
      style={style}>
      {children}
    </div>
  );
}

function CardHeader({
  d,
  accent,
  trailing,
}: {
  d: HomeDevice;
  accent: string;
  trailing?: React.ReactNode;
}) {
  const meta = TYPE_META[d.type];
  const label = deviceLabel(d);
  // If the user renamed the device, surface the original as a quiet subtitle
  // so they can still identify the underlying hardware.
  const subtitle =
    d.display_name && d.display_name.trim() && d.display_name.trim() !== d.name
      ? d.name
      : d.room;
  return (
    <div className="flex items-start gap-1.5 min-w-0">
      <span style={{ color: accent }} className="mt-0.5 shrink-0">
        {meta.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className="truncate text-xs font-medium text-foreground/95 leading-tight"
          title={label}>
          {label}
        </div>
        {subtitle && (
          <div className="truncate text-xs text-muted-foreground/70 mt-0.5">
            {subtitle}
          </div>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

function MetaRow({ d }: { d: HomeDevice }) {
  const hasMeta =
    d.battery != null ||
    d.temp != null ||
    d.humidity != null ||
    d.pm25 != null ||
    d.voc != null;
  if (!hasMeta && d.reachable) return null;
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground/70 flex-wrap">
      {d.temp != null && (
        <span className="flex items-center gap-0.5">
          <Thermometer size={9} />
          {d.temp.toFixed(1)}°
        </span>
      )}
      {d.humidity != null && (
        <span className="flex items-center gap-0.5">
          <Droplets size={9} />
          {d.humidity}%
        </span>
      )}
      {d.pm25 != null && (
        <span
          className="flex items-center gap-0.5"
          title="PM2.5 µg/m³"
          style={{ color: aqColor(d.pm25) }}>
          <Wind size={9} />
          {d.pm25}
        </span>
      )}
      {d.voc != null && (
        <span
          className="flex items-center gap-0.5"
          title="VOC index"
          style={{ color: vocColor(d.voc) }}>
          <Activity size={9} />
          {d.voc}
        </span>
      )}
      {d.battery != null && (
        <span
          className="flex items-center gap-0.5"
          style={{ color: d.battery < 20 ? '#f87171' : undefined }}>
          <Battery size={9} />
          {d.battery}%
        </span>
      )}
      {!d.reachable && <span className="text-amber-400/70">offline</span>}
    </div>
  );
}

// PM2.5 colour bands (µg/m³) — WHO interim targets.
function aqColor(pm25: number): string {
  if (pm25 <= 10) return '#94d3a2';
  if (pm25 <= 25) return '#f5b942';
  if (pm25 <= 50) return '#f97316';
  return '#f87171';
}
// VOC index colour bands — SGP41 spec: <100 normal, >=200 elevated.
function vocColor(voc: number): string {
  if (voc < 100) return '#94d3a2';
  if (voc < 200) return '#f5b942';
  if (voc < 300) return '#f97316';
  return '#f87171';
}

// Minimalist horizontal slider — thin track, no native chrome, drag or click
// to set value. Reports the final value via onCommit; live drag value is
// reflected locally for snappy feedback.
function MiniSlider({
  value,
  onChange,
  onCommit,
  accent,
  disabled,
  dim,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
  accent: string;
  disabled?: boolean;
  /** When true the active fill renders muted (e.g. light is off). */
  dim?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const valueFromEvent = useCallback((clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onChange(valueFromEvent(e.clientX));
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    onChange(valueFromEvent(e.clientX));
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    onCommit(valueFromEvent(e.clientX));
  };

  const fillPct = Math.max(0, Math.min(100, value));
  const fillColor = dim ? 'rgba(255,255,255,0.14)' : accent;
  const knobColor = dim ? 'rgba(255,255,255,0.45)' : accent;

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
      className={`relative flex-1 h-4 flex items-center select-none touch-none ${
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
      }`}>
      {/* Track */}
      <div className="absolute inset-x-0 h-1 rounded-full bg-white/[0.07]" />
      {/* Fill */}
      <div
        className="absolute h-1 rounded-full transition-[width] duration-75"
        style={{ width: `${fillPct}%`, backgroundColor: fillColor }}
      />
      {/* Knob — small visible thumb so the control is unmistakable. */}
      <div
        className="absolute w-3 h-3 rounded-full shadow-sm border border-white/30 -ml-1.5"
        style={{ left: `${fillPct}%`, backgroundColor: knobColor }}
      />
    </div>
  );
}

function TogglePill({
  on,
  onClick,
  accent,
}: {
  on: boolean;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="rounded-full w-8 h-4 relative transition-colors duration-150 cursor-pointer active:scale-95"
      style={{ backgroundColor: on ? accent : 'rgba(255,255,255,0.08)' }}
      title={on ? 'Turn off' : 'Turn on'}>
      <span
        className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-150 ${
          on ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

// ─── Per-type cards ────────────────────────────────────────────────────────
function LightCard({ d, onAction }: { d: HomeDevice; onAction: ActionFn }) {
  const accent = TYPE_META.light.accent;
  const isOn = !!d.on;
  const canDim = d.brightness != null;
  const [bri, setBri] = useState<number>(d.brightness ?? 0);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setBri(d.brightness ?? 0);
  }, [d.brightness]);

  return (
    <CardShell d={d} active={isOn} accent={accent}>
      <CardHeader
        d={d}
        accent={accent}
        trailing={
          <TogglePill
            on={isOn}
            accent={accent}
            onClick={() => onAction(d, isOn ? 'off' : 'on')}
          />
        }
      />
      {canDim && (
        <div className="mt-2.5 flex items-center gap-2">
          <MiniSlider
            value={isOn ? bri : 0}
            onChange={(v) => {
              setBri(v);
              dragging.current = true;
            }}
            onCommit={(v) => {
              dragging.current = false;
              setBri(v);
              onAction(d, 'brightness', v);
            }}
            accent={accent}
            disabled={!d.reachable}
            dim={!isOn}
          />
          <span
            className={`text-xs tabular-nums w-7 text-right ${
              isOn ? 'text-foreground/85' : 'text-muted-foreground/65'
            }`}>
            {isOn ? `${bri}%` : 'off'}
          </span>
        </div>
      )}
      <MetaRow d={d} />
    </CardShell>
  );
}

function PlugCard({ d, onAction }: { d: HomeDevice; onAction: ActionFn }) {
  const accent = TYPE_META[d.type].accent;
  const isOn = !!d.on;
  return (
    <CardShell d={d} active={isOn} accent={accent}>
      <CardHeader
        d={d}
        accent={accent}
        trailing={
          <TogglePill
            on={isOn}
            accent={accent}
            onClick={() => onAction(d, isOn ? 'off' : 'on')}
          />
        }
      />
      <MetaRow d={d} />
    </CardShell>
  );
}

function BlindCard({ d, onAction }: { d: HomeDevice; onAction: ActionFn }) {
  const accent = TYPE_META.blind.accent;
  // 0 = fully open, 100 = fully closed (DIRIGERA convention).
  const [pos, setPos] = useState<number>(d.position ?? 0);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setPos(d.position ?? 0);
  }, [d.position]);

  const active = (d.position ?? 0) > 0;

  return (
    <CardShell d={d} active={active} accent={accent}>
      <CardHeader
        d={d}
        accent={accent}
        trailing={
          <span className="text-xs tabular-nums text-muted-foreground/70">
            {pos === 0 ? 'open' : pos === 100 ? 'shut' : `${pos}%`}
          </span>
        }
      />
      <div className="mt-2 space-y-1.5">
        <MiniSlider
          value={pos}
          onChange={setPos}
          onCommit={(v) => onAction(d, 'position', v)}
          accent={accent}
          disabled={!d.reachable}
        />
        <div className="flex items-center gap-1">
          <BlindBtn
            label="Open"
            icon={<ChevronUp size={11} />}
            onClick={() => onAction(d, 'position', 0)}
          />
          <BlindBtn
            label="Stop"
            icon={<Square size={9} />}
            onClick={() => onAction(d, 'stop')}
          />
          <BlindBtn
            label="Close"
            icon={<ChevronDown size={11} />}
            onClick={() => onAction(d, 'position', 100)}
          />
        </div>
      </div>
      <MetaRow d={d} />
    </CardShell>
  );
}

function BlindBtn({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1 text-xs py-1 rounded border border-border/20 hover:border-border/40 hover:bg-white/[0.04] text-muted-foreground/75 hover:text-foreground/95 transition-colors">
      {icon}
      <span>{label}</span>
    </button>
  );
}

// Read-only card for remotes / sensors / TVs / speakers. Sensors get a
// prominent reading band so room conditions read at a glance.
function InfoCard({ d }: { d: HomeDevice }) {
  const accent = TYPE_META[d.type].accent;
  const isSensor = d.type === 'sensor';
  const hasReadings =
    d.temp != null || d.humidity != null || d.pm25 != null || d.voc != null;
  return (
    <CardShell d={d} active={false}>
      <CardHeader d={d} accent={accent} />
      {isSensor && hasReadings && (
        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs tabular-nums">
          {d.temp != null && (
            <Reading
              icon={<Thermometer size={10} />}
              label="Temp"
              value={`${d.temp.toFixed(1)}°`}
            />
          )}
          {d.humidity != null && (
            <Reading
              icon={<Droplets size={10} />}
              label="Hum"
              value={`${d.humidity}%`}
            />
          )}
          {d.pm25 != null && (
            <Reading
              icon={<Wind size={10} />}
              label="PM2.5"
              value={String(d.pm25)}
              color={aqColor(d.pm25)}
            />
          )}
          {d.voc != null && (
            <Reading
              icon={<Activity size={10} />}
              label="VOC"
              value={String(d.voc)}
              color={vocColor(d.voc)}
            />
          )}
        </div>
      )}
      {/* Battery / offline state — keep MetaRow only when sensor isn't already
          showing readings, otherwise it duplicates info. */}
      {(!isSensor || !hasReadings) && <MetaRow d={d} />}
      {isSensor && hasReadings && (d.battery != null || !d.reachable) && (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground/70">
          {d.battery != null && (
            <span
              className="flex items-center gap-0.5"
              style={{ color: d.battery < 20 ? '#f87171' : undefined }}>
              <Battery size={9} />
              {d.battery}%
            </span>
          )}
          {!d.reachable && <span className="text-amber-400/70">offline</span>}
        </div>
      )}
    </CardShell>
  );
}

function Reading({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground/65">{icon}</span>
      <span className="text-muted-foreground/70 text-xs uppercase tracking-wider w-9">
        {label}
      </span>
      <span
        className="font-medium text-foreground/85"
        style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}

