import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const TONE = {
  error: {
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
    icon: <CircleAlert />,
  },
  success: {
    className: 'border-success/30 bg-success/10 text-success',
    icon: <CircleCheck />,
  },
  info: { className: 'bg-muted/40 text-foreground', icon: <Info /> },
} as const;

/** Inline message box. Errors are announced immediately (role="alert"). */
export function Alert({
  tone = 'error',
  icon,
  className,
  children,
}: {
  tone?: keyof typeof TONE;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0',
        t.className,
        className,
      )}
    >
      {icon ?? t.icon}
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}
