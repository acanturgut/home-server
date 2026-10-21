import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Page chrome inside the app shell: a header (icon + title) above the
 * content. Padded pages sit in a centred column; `fullBleed` pages (with
 * their own rails) fill the frame.
 */
export function PageLayout({
  title,
  icon,
  fullBleed = false,
  children,
}: {
  title: string;
  icon?: ReactNode;
  fullBleed?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 px-4 pt-6 pb-5 sm:px-8">
        <h1
          className={cn(
            'flex min-w-0 items-center gap-3 text-xl font-semibold tracking-tight text-foreground',
            !fullBleed && 'mx-auto max-w-6xl',
          )}
        >
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <span className="truncate">{title}</span>
        </h1>
      </header>
      {fullBleed ? (
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      ) : (
        <main className="min-w-0 flex-1 overflow-auto px-4 pb-10 sm:px-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      )}
    </div>
  );
}
