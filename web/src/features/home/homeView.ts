import type { HomeDevice } from '@/features/home/api';
import {
  UNASSIGNED_ROOM,
  deviceLabel,
  roomOf,
} from '@/features/home/deviceMeta';
import { plural } from '@/lib/format';

/** Route sub-paths (`/home/<sub>`) that are views, not rooms. */
export const ALL_ROOMS = 'all';
export const HIDDEN_VIEW = '__hidden__';

export interface RoomGroup {
  name: string;
  /** Controllable / informational devices, sorted by label. */
  devices: HomeDevice[];
  sensors: HomeDevice[];
}

interface HomeView {
  title: string;
  description: string;
  hiddenView: boolean;
  /** Rooms of the dashboard (non-hidden) devices, for the nav. */
  rooms: RoomGroup[];
  /** Rooms rendered in the detail pane. */
  shown: RoomGroup[];
  /** Sensors of the shown rooms (ConditionsCard). */
  sensors: HomeDevice[];
  /** Every named room, for the edit dialog's suggestions. */
  roomNames: string[];
  dashboardCount: number;
  hiddenCount: number;
}

export function roomSummary(r: RoomGroup): string {
  const s = r.sensors.length;
  return (
    plural(r.devices.length, 'device') + (s ? ` · ${plural(s, 'sensor')}` : '')
  );
}

function groupByRoom(devices: HomeDevice[]): RoomGroup[] {
  const rooms = new Map<string, RoomGroup>();
  const sorted = [...devices].sort((a, b) =>
    deviceLabel(a).localeCompare(deviceLabel(b)),
  );
  for (const d of sorted) {
    const name = roomOf(d);
    let g = rooms.get(name);
    if (!g) rooms.set(name, (g = { name, devices: [], sensors: [] }));
    (d.type === 'sensor' ? g.sensors : g.devices).push(d);
  }
  return [...rooms.values()].sort((a, b) =>
    a.name === UNASSIGNED_ROOM
      ? 1
      : b.name === UNASSIGNED_ROOM
        ? -1
        : a.name.localeCompare(b.name),
  );
}

/**
 * Everything the Smart Home page shows for a route sub-path: `all` (or
 * none), `__hidden__`, or a room name.
 */
export function deriveHomeView(
  devices: HomeDevice[],
  sub: string | undefined,
): HomeView {
  const dashboard = devices.filter((d) => !d.hidden);
  const hidden = devices.filter((d) => d.hidden);
  const rooms = groupByRoom(dashboard);
  const hiddenView = sub === HIDDEN_VIEW;
  const room = sub && sub !== ALL_ROOMS && !hiddenView ? sub : undefined;
  const shown = hiddenView
    ? groupByRoom(hidden)
    : room
      ? rooms.filter((r) => r.name === room)
      : rooms;

  let title = 'All rooms';
  let description: string;
  if (hiddenView) {
    title = 'Hidden devices';
    description = `${plural(hidden.length, 'device')} hidden from the dashboard`;
  } else if (room) {
    title = room;
    description = shown[0] ? roomSummary(shown[0]) : plural(0, 'device');
  } else {
    const switches = dashboard.filter(
      (d) => d.type === 'light' || d.type === 'plug',
    );
    const on = switches.filter((d) => d.on).length;
    const reachable = dashboard.filter((d) => d.reachable).length;
    description =
      (switches.length ? `${on}/${switches.length} on · ` : '') +
      `${reachable}/${dashboard.length} reachable`;
  }

  const roomNames = [
    ...new Set(devices.map((d) => d.room?.trim()).filter((r) => !!r)),
  ] as string[];

  return {
    title,
    description,
    hiddenView,
    rooms,
    shown,
    sensors: shown.flatMap((r) => r.sensors),
    roomNames: roomNames.sort((a, b) => a.localeCompare(b)),
    dashboardCount: dashboard.length,
    hiddenCount: hidden.length,
  };
}
