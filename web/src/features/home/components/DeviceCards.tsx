import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Pencil, Square } from 'lucide-react';
import type { HomeAction, HomeDevice } from '@/features/home/api';
import {
  DEVICE_MIME,
  TYPE_META,
  deviceLabel,
} from '@/features/home/deviceMeta';
import { Readings } from '@/features/home/components/Readings';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export type OnAction = (d: HomeDevice, action: HomeAction) => void;

interface CardProps {
  device: HomeDevice;
  onAction: OnAction;
  onEdit: (d: HomeDevice) => void;
}

/** Control card for one device, by type. */
export function DeviceCard(props: CardProps) {
  switch (props.device.type) {
    case 'light':
      return <LightCard {...props} />;
    case 'blind':
      return <BlindCard {...props} />;
    case 'tv':
    case 'speaker':
    case 'remote':
      return <DeviceShell device={props.device} onEdit={props.onEdit} />;
    default:
      return <PlugCard {...props} />;
  }
}

/**
 * Card chrome: type icon, name (the drag handle for moving rooms), edit
 * button, an optional trailing control, and the readings line. Offline
 * devices are dashed and dimmed.
 */
function DeviceShell({
  device: d,
  active = false,
  trailing,
  onEdit,
  children,
}: {
  device: HomeDevice;
  active?: boolean;
  trailing?: ReactNode;
  onEdit: (d: HomeDevice) => void;
  children?: ReactNode;
}) {
  const label = deviceLabel(d);
  const Icon = TYPE_META[d.type].icon;
  const renamed = !!d.display_name?.trim() && d.display_name.trim() !== d.name;
  return (
    <Card
      className={cn(
        'flex flex-col gap-3',
        !d.reachable && 'border-dashed opacity-60',
      )}
    >
      <div className="flex items-center gap-2">
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData(DEVICE_MIME, d.id);
          }}
          className="flex min-w-0 flex-1 items-center gap-2 lg:cursor-grab"
        >
          <Icon
            aria-hidden
            className={cn(
              'size-4 shrink-0',
              active ? 'text-foreground' : 'text-muted-foreground',
            )}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={label}>
              {label}
            </p>
            {renamed && (
              <p className="truncate text-xs text-muted-foreground">{d.name}</p>
            )}
          </div>
        </div>
        <IconButton
          icon={<Pencil />}
          label={`Edit ${label}`}
          onClick={() => onEdit(d)}
        />
        {trailing}
      </div>
      {children}
      <Readings device={d} />
    </Card>
  );
}

function PowerSwitch({ device, onAction }: Omit<CardProps, 'onEdit'>) {
  return (
    <Switch
      checked={!!device.on}
      onCheckedChange={(on) => onAction(device, { action: on ? 'on' : 'off' })}
      aria-label={`${deviceLabel(device)} power`}
    />
  );
}

function PlugCard({ device, onAction, onEdit }: CardProps) {
  return (
    <DeviceShell
      device={device}
      active={!!device.on}
      onEdit={onEdit}
      trailing={<PowerSwitch device={device} onAction={onAction} />}
    />
  );
}

function LightCard({ device: d, onAction, onEdit }: CardProps) {
  // Local value only while dragging; otherwise the device state rules.
  const [drag, setDrag] = useState<number | null>(null);
  const on = !!d.on;
  const value = drag ?? (on ? (d.brightness ?? 0) : 0);
  return (
    <DeviceShell
      device={d}
      active={on}
      onEdit={onEdit}
      trailing={<PowerSwitch device={d} onAction={onAction} />}
    >
      {d.brightness != null && (
        <div className="flex items-center gap-3">
          <Slider
            value={value}
            onValueChange={setDrag}
            onValueCommitted={(v) => {
              setDrag(null);
              onAction(d, { action: 'brightness', brightness: v });
            }}
            disabled={!d.reachable}
            aria-label={`${deviceLabel(d)} brightness`}
          />
          <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
            {on || drag != null ? `${value}%` : 'Off'}
          </span>
        </div>
      )}
    </DeviceShell>
  );
}

function BlindCard({ device: d, onAction, onEdit }: CardProps) {
  // 0 = fully open, 100 = fully closed (DIRIGERA convention).
  const [drag, setDrag] = useState<number | null>(null);
  const pos = drag ?? d.position ?? 0;
  const setPosition = (position: number) =>
    onAction(d, { action: 'position', position });
  return (
    <DeviceShell
      device={d}
      active={(d.position ?? 0) > 0}
      onEdit={onEdit}
      trailing={
        <span className="text-xs text-muted-foreground tabular-nums">
          {pos === 0 ? 'Open' : pos === 100 ? 'Closed' : `${pos}%`}
        </span>
      }
    >
      <Slider
        value={pos}
        onValueChange={setDrag}
        onValueCommitted={(v) => {
          setDrag(null);
          setPosition(v);
        }}
        disabled={!d.reachable}
        aria-label={`${deviceLabel(d)} position`}
      />
      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" size="sm" onClick={() => setPosition(0)}>
          <ChevronUp />
          Open
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAction(d, { action: 'stop' })}
        >
          <Square />
          Stop
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPosition(100)}>
          <ChevronDown />
          Close
        </Button>
      </div>
    </DeviceShell>
  );
}
