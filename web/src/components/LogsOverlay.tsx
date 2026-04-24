import { LogsPanel } from '@/panels/LogsPanel';

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
      className={`shrink-0 border-t border-border/30 bg-background/95 backdrop-blur-sm transition-all overflow-hidden ${
        open ? 'h-72' : 'h-0 border-t-0'
      }`}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/20">
        <span className="text-[11px] font-medium text-muted-foreground">
          Logs
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onTogglePin}
            title={pinned ? 'Unpin logs' : 'Pin logs'}
            className={`text-[11px] px-1.5 py-0.5 rounded transition-colors ${
              pinned
                ? 'text-foreground bg-foreground/10'
                : 'text-muted-foreground hover:text-foreground'
            }`}>
            📌
          </button>
          <button
            onClick={onClose}
            className="text-[11px] text-muted-foreground hover:text-foreground px-1">
            ✕
          </button>
        </div>
      </div>
      <div className="px-3 py-2 h-[calc(100%-2rem)] overflow-auto">
        <LogsPanel />
      </div>
    </div>
  );
}
