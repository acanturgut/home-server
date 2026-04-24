import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icon node — typically a lucide-react icon. */
  icon: ReactNode;
  /** Accessible/tooltip label. Required. */
  label: string;
  /** Visual variant. */
  variant?: 'ghost' | 'solid' | 'subtle';
  /** When true, applies the active/pressed style. */
  active?: boolean;
  /** Pixel square size of the button. Defaults to 28. */
  size?: number;
}

const VARIANTS: Record<NonNullable<IconButtonProps['variant']>, string> = {
  ghost:
    'text-muted-foreground hover:text-foreground hover:bg-muted/30',
  solid:
    'bg-foreground/10 text-foreground hover:bg-foreground/15',
  subtle:
    'text-muted-foreground/70 hover:text-foreground hover:bg-muted/20',
};

/**
 * Icon-only button with a built-in `title` tooltip. Replaces the dozens of
 * hand-rolled `<button title="..." className="w-X h-X ...">` blocks scattered
 * across panels.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      icon,
      label,
      variant = 'ghost',
      active = false,
      size = 28,
      className,
      type = 'button',
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        title={label}
        aria-label={label}
        className={cn(
          'inline-flex items-center justify-center rounded-md transition-all',
          VARIANTS[variant],
          active && 'bg-foreground/10 text-foreground',
          className,
        )}
        style={{ width: size, height: size }}
        {...rest}>
        {icon}
      </button>
    );
  },
);
