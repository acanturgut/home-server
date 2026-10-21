import { useState } from 'react';
import type { HomeDevice } from '@/features/home/api';
import { DEVICE_MIME, TYPE_META, TYPE_ORDER } from '@/features/home/deviceMeta';
import type { RoomGroup } from '@/features/home/homeView';
import {
  DeviceCard,
  type OnAction,
} from '@/features/home/components/DeviceCards';
import { cn } from '@/lib/utils';

/** One room's devices, grouped by type. Dropping a device card here moves it. */
export function RoomSection({
  room,
  onAction,
  onEdit,
  onMove,
}: {
  room: RoomGroup;
  onAction: OnAction;
  onEdit: (d: HomeDevice) => void;
  onMove: (deviceId: string, room: string) => void;
}) {
  const [dropping, setDropping] = useState(false);
  const groups = TYPE_ORDER.map(
    (type) => [type, room.devices.filter((d) => d.type === type)] as const,
  ).filter(([, devices]) => devices.length > 0);

  return (
    <section
      aria-label={room.name}
      onDragOver={(e) => {
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        const id = e.dataTransfer.getData(DEVICE_MIME);
        if (id) onMove(id, room.name);
      }}
      className={cn(
        'space-y-3 rounded-lg',
        dropping && 'outline-2 outline-offset-4 outline-ring',
      )}
    >
      <h3 className="flex items-center gap-2 text-sm font-medium">
        {room.name}
        <span className="text-xs font-normal text-muted-foreground tabular-nums">
          {room.devices.length}
        </span>
      </h3>
      {groups.map(([type, devices]) => {
        const meta = TYPE_META[type];
        return (
          <div key={type} className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <meta.icon aria-hidden className="size-3.5" />
              {meta.group} · {devices.length}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {devices.map((d) => (
                <DeviceCard
                  key={d.id}
                  device={d}
                  onAction={onAction}
                  onEdit={onEdit}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
