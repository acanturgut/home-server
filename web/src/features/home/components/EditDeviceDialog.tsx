import { useId, useState } from 'react';
import type {
  DeviceOverride,
  HomeDevice,
  HomeDeviceType,
} from '@/features/home/api';
import { BRIDGE_KINDS } from '@/features/home/bridgeKinds';
import { TYPE_META, deviceLabel } from '@/features/home/deviceMeta';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Switch } from '@/components/ui/switch';

const TYPE_OPTIONS = (Object.keys(TYPE_META) as HomeDeviceType[]).map((t) => {
  const { icon: Icon, name } = TYPE_META[t];
  return { value: t, label: name, icon: <Icon /> };
});

/** Rename, move, retype or hide a device. Mount with `key={device.id}`. */
export function EditDeviceDialog({
  device,
  rooms,
  onClose,
  onSave,
}: {
  device: HomeDevice;
  /** Existing room names, offered as suggestions. */
  rooms: string[];
  onClose: () => void;
  onSave: (o: DeviceOverride) => void;
}) {
  const formId = useId();
  const roomsId = useId();
  const [form, setForm] = useState({
    name: device.display_name ?? '',
    room: device.room ?? '',
    type: device.type,
    hidden: !!device.hidden,
  });
  const set = (patch: Partial<typeof form>) =>
    setForm((f) => ({ ...f, ...patch }));
  const original = device.name ?? '';

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={deviceLabel(device)}
      description={[original, BRIDGE_KINDS[device.bridge_kind].label]
        .filter(Boolean)
        .join(' · ')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId}>
            Save
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const name = form.name.trim();
          // An empty name clears the override and shows the bridge name.
          onSave({
            ...form,
            name: name === original.trim() ? '' : name,
            room: form.room.trim(),
          });
        }}
      >
        <Field
          label="Display name"
          hint={original && `Leave blank to use “${original}”.`}
        >
          <Input
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder={original || 'Reading lamp'}
          />
        </Field>
        <Field label="Room">
          <Input
            value={form.room}
            onChange={(e) => set({ room: e.target.value })}
            placeholder="Living room"
            list={roomsId}
          />
        </Field>
        <datalist id={roomsId}>
          {rooms.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Type</p>
          <SegmentedControl
            aria-label="Device type"
            size="sm"
            className="flex flex-wrap"
            value={form.type}
            onValueChange={(type) => set({ type })}
            options={TYPE_OPTIONS}
          />
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">
          Hide from dashboard
          <Switch
            checked={form.hidden}
            onCheckedChange={(hidden) => set({ hidden })}
          />
        </label>
      </form>
    </Dialog>
  );
}
