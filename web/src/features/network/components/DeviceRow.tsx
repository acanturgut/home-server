import {
  Ban,
  CheckCircle2,
  Copy,
  ExternalLink,
  Pencil,
  Signal,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MenuItem } from '@/components/ui/menu';
import { StatusDot } from '@/components/ui/status-dot';
import { toast } from '@/components/ui/toast';
import { deviceLabel, type RouterClient } from '@/features/network/api';
import { DeviceActions } from '@/features/network/components/DeviceActions';
import { copyToClipboard } from '@/lib/format';

async function copy(text: string, what: string) {
  const ok = await copyToClipboard(text);
  toast(ok ? `${what} copied` : `Couldn't copy the ${what}`, {
    tone: ok ? 'success' : 'error',
  });
}

/** One router client: status, name, band and signal, address, block toggle and actions. */
export function DeviceRow({
  client: c,
  busy,
  onToggleBlock,
  onWake,
  onRename,
}: {
  client: RouterClient;
  busy: boolean;
  onToggleBlock: () => void;
  onWake: () => void;
  onRename: () => void;
}) {
  const label = deviceLabel(c);
  const address = [c.ip, c.mac].filter(Boolean).join(' · ');
  const showSignal = c.online && c.iface !== 'wired' && !!c.rssi;

  const items: MenuItem[] = [
    {
      label: c.blocked ? 'Unblock internet' : 'Block internet',
      icon: c.blocked ? <CheckCircle2 /> : <Ban />,
      onSelect: onToggleBlock,
      destructive: !c.blocked,
    },
    { label: 'Rename', icon: <Pencil />, onSelect: onRename },
    { label: 'Wake on LAN', icon: <Zap />, onSelect: onWake },
  ];
  if (c.ip) {
    const ip = c.ip;
    items.push(
      {
        label: 'Open in browser',
        icon: <ExternalLink />,
        onSelect: () =>
          window.open(`http://${ip}`, '_blank', 'noopener,noreferrer'),
      },
      { label: 'Copy IP', icon: <Copy />, onSelect: () => copy(ip, 'IP') },
    );
  }
  items.push({
    label: 'Copy MAC',
    icon: <Copy />,
    onSelect: () => copy(c.mac, 'MAC'),
  });

  return (
    <li className="flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-muted/50">
      <StatusDot status={c.online ? 'online' : 'offline'} className="size-2" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{label}</span>
          {c.iface && <Badge mono>{c.iface}</Badge>}
          {showSignal && (
            <span
              className="inline-flex items-center gap-0.5 font-mono text-xs text-muted-foreground"
              title={`Signal ${c.rssi} dBm`}
            >
              <Signal aria-hidden className="size-3" />
              {c.rssi}
            </span>
          )}
          {c.guest && <Badge tone="warning">Guest</Badge>}
          {c.blocked && <Badge tone="destructive">Blocked</Badge>}
        </div>
        <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground tabular-nums">
          {address}
        </p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        loading={busy}
        onClick={onToggleBlock}
        className="hidden sm:inline-flex"
      >
        {c.blocked ? 'Unblock' : 'Block'}
      </Button>
      <DeviceActions title={label} description={address} items={items} />
    </li>
  );
}
