import { useCallback, useRef, useState } from 'react';
import {
  homeApi,
  type DeviceOverride,
  type HomeAction,
  type HomeDevice,
  type HomeSnapshot,
} from '@/features/home/api';
import {
  UNASSIGNED_ROOM,
  deviceLabel,
  roomOf,
} from '@/features/home/deviceMeta';
import { toast } from '@/components/ui/toast';
import { usePolling } from '@/hooks/usePolling';
import { errorMessage } from '@/lib/format';

/** How long a control change wins over polled state while the bridge catches up. */
const HOLD_MS = 4000;

function applyAction(d: HomeDevice, a: HomeAction): HomeDevice {
  switch (a.action) {
    case 'on':
      return { ...d, on: true };
    case 'off':
      return { ...d, on: false };
    case 'toggle':
      return { ...d, on: !d.on };
    case 'brightness':
      return { ...d, brightness: a.brightness, on: a.brightness > 0 };
    case 'position':
      return { ...d, position: a.position };
    case 'stop':
      return d;
  }
}

/**
 * Smart Home snapshot with polling and optimistic control: a device's
 * on / brightness / position stay as set for HOLD_MS, so a poll that lands
 * before the bridge updates doesn't flip the UI back.
 */
export function useHomeDevices() {
  const [snap, setSnap] = useState<HomeSnapshot | null>(null);
  const holdUntil = useRef(new Map<string, number>());
  const inFlight = useRef(0);

  const merge = useCallback((next: HomeSnapshot) => {
    const now = Date.now();
    const held = new Set(
      [...holdUntil.current].filter(([, t]) => t > now).map(([id]) => id),
    );
    setSnap((prev) => {
      if (!prev || held.size === 0) return next;
      const local = new Map(prev.devices.map((d) => [d.id, d]));
      return {
        ...next,
        devices: next.devices.map((d) => {
          const l = held.has(d.id) ? local.get(d.id) : undefined;
          return l
            ? { ...d, on: l.on, brightness: l.brightness, position: l.position }
            : d;
        }),
      };
    });
  }, []);

  const load = useCallback(async () => {
    if (inFlight.current > 0) return;
    const next = await homeApi.list();
    if (next) merge(next);
  }, [merge]);

  usePolling(load, 8000);

  const patch = (ids: Set<string>, fn: (d: HomeDevice) => HomeDevice) =>
    setSnap(
      (prev) =>
        prev && {
          ...prev,
          devices: prev.devices.map((d) => (ids.has(d.id) ? fn(d) : d)),
        },
    );

  const control = useCallback(
    async (devices: HomeDevice[], action: HomeAction) => {
      const until = Date.now() + HOLD_MS;
      devices.forEach((d) => holdUntil.current.set(d.id, until));
      patch(new Set(devices.map((d) => d.id)), (d) => applyAction(d, action));
      inFlight.current += 1;
      const results = await Promise.allSettled(
        devices.map((d) => homeApi.apply(d.id, action)),
      );
      inFlight.current -= 1;
      const failed = devices.filter((_, i) => results[i].status === 'rejected');
      if (failed.length > 0) {
        failed.forEach((d) => holdUntil.current.delete(d.id));
        const reason = results.find((r) => r.status === 'rejected');
        toast(
          failed.length === 1
            ? `Couldn't control ${deviceLabel(failed[0])}`
            : `Couldn't control ${failed.length} devices`,
          {
            tone: 'error',
            description: errorMessage((reason as PromiseRejectedResult).reason),
          },
        );
      }
      const next = await homeApi.list();
      if (next) merge(next);
    },
    [merge],
  );

  const setOverride = useCallback(
    async (dev: HomeDevice, o: DeviceOverride) => {
      // The endpoint replaces the whole override, so send every field or a
      // room move would also drop the device's custom name and hidden flag.
      const full = {
        name: dev.display_name ?? '',
        room: dev.room ?? '',
        type: dev.type,
        hidden: !!dev.hidden,
        ...o,
      };
      patch(new Set([dev.id]), (d) => ({
        ...d,
        display_name: full.name,
        room: full.room,
        type: full.type,
        hidden: full.hidden,
      }));
      try {
        await homeApi.setDeviceOverride(dev.id, full);
      } catch (e) {
        toast(`Couldn't update ${deviceLabel(dev)}`, {
          tone: 'error',
          description: errorMessage(e),
        });
        void load();
      }
    },
    [load],
  );

  /** Drop target handler: reassigns a dragged device to `room`. */
  const move = useCallback(
    (deviceId: string, room: string) => {
      const dev = snap?.devices.find((d) => d.id === deviceId);
      if (!dev || roomOf(dev) === room) return;
      void setOverride(dev, { room: room === UNASSIGNED_ROOM ? '' : room });
    },
    [snap, setOverride],
  );

  return { snap, control, setOverride, move };
}
