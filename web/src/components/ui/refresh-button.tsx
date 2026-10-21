import { RefreshCw } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils';

/** Icon button that reloads data; the icon spins and the button disables while `busy`. */
export function RefreshButton({
  onClick,
  busy = false,
  label = 'Refresh',
}: {
  onClick: () => void;
  busy?: boolean;
  label?: string;
}) {
  return (
    <IconButton
      icon={<RefreshCw className={cn(busy && 'animate-spin')} />}
      label={label}
      onClick={onClick}
      disabled={busy}
      aria-busy={busy || undefined}
    />
  );
}
