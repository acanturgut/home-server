import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Spinning loader in the current text colour. Decorative by default; pass
 * `label` when it is the only loading cue so screen readers announce it.
 */
export function Spinner({
  size = 14,
  label,
  className,
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <Loader2
      size={size}
      className={cn('shrink-0 animate-spin', className)}
      {...(label
        ? { role: 'status', 'aria-label': label }
        : { 'aria-hidden': true })}
    />
  );
}
