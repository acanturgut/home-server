import type { ReactNode } from 'react';

/**
 * Page chrome inside the app shell: a header (icon + title) above the
 * content. Content is padded unless `fullBleed` (pages with their own rails).
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
      <header className="shrink-0 px-4 pt-5 pb-3 sm:px-6">
        <h1 className="flex min-w-0 items-center gap-2.5 text-base font-medium text-foreground">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <span className="truncate">{title}</span>
        </h1>
      </header>
      <main
        className={
          fullBleed
            ? 'flex min-w-0 flex-1 flex-col overflow-hidden'
            : 'min-w-0 flex-1 overflow-auto p-4 sm:p-6'
        }
      >
        {children}
      </main>
    </div>
  );
}
