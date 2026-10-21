import { Pin, PinOff, ScrollText, X } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { LogsPanel } from '@/features/logs';

interface LogsOverlayProps {
  open: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
}

export function LogsOverlay({
  open,
  pinned,
  onTogglePin,
  onClose,
}: LogsOverlayProps) {
  return (
    <div
      className={`shrink-0 bg-muted/20 transition-all overflow-hidden ${
        open ? 'h-72' : 'h-0'
      }`}>
      <div className="flex items-center justify-between pl-5 pr-3 pt-2">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <ScrollText size={13} />
          Logs
        </span>
        <div className="flex items-center gap-1">
          <IconButton
            icon={pinned ? <PinOff size={14} /> : <Pin size={14} />}
            label={pinned ? 'Unpin logs' : 'Pin logs'}
            active={pinned}
            onClick={onTogglePin}
          />
          <IconButton
            icon={<X size={14} />}
            label="Close logs"
            onClick={onClose}
          />
        </div>
      </div>
      <div className="px-5 py-2 h-[calc(100%-2.5rem)] overflow-auto">
        <LogsPanel />
      </div>
    </div>
  );
}
