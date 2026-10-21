import { ScrollText, X } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils';
import { LogsPanel } from '@/features/logs';

/**
 * Slide-up log drawer above the status bar. The panel (and its polling)
 * only mounts while open.
 */
export function LogsOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <section
      aria-label="Server logs"
      inert={!open}
      className={cn(
        'shrink-0 overflow-hidden bg-card transition-[height]',
        open ? 'h-72 border-t' : 'h-0',
      )}
    >
      <div className="flex items-center justify-between pt-2 pr-3 pl-5">
        <h2 className="flex items-center gap-2 text-xs text-muted-foreground">
          <ScrollText size={13} />
          Logs
        </h2>
        <IconButton icon={<X />} label="Close logs" onClick={onClose} />
      </div>
      <div className="h-[calc(100%-2.5rem)] overflow-auto px-5 py-2">
        {open && <LogsPanel />}
      </div>
    </section>
  );
}
