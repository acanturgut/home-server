import type { ReactNode } from 'react';

export interface PageLayoutProps {
  /** Page title — rendered in the top header. Hidden when omitted. */
  title?: string;
  /** Optional icon shown before the title. */
  icon?: ReactNode;
  /** Optional toolbar elements rendered at the right of the header. */
  toolbar?: ReactNode;
  /** Optional content rendered centered in the header (between title & toolbar). */
  headerCenter?: ReactNode;
  /** Page content. */
  children: ReactNode;
  /**
   * When true, content fills the whole frame with no padding (used by editor
   * style pages). Defaults to false.
   */
  fullBleed?: boolean;
}

/**
 * Standard page chrome shared across panels: a sticky header (icon + title,
 * centered slot, toolbar) above the page content.
 *
 * The outer App shell still owns the navigation sidebar, the slide-up logs
 * overlay and the global status bar.
 */
export function PageLayout({
  title,
  icon,
  toolbar,
  headerCenter,
  children,
  fullBleed = false,
}: PageLayoutProps) {
  const showHeader = title || toolbar || headerCenter;
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {showHeader && (
        <div className="sticky top-0 z-10 bg-background px-4 sm:px-6 pt-5 pb-3 shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {title ? (
            <h1 className="flex min-w-0 items-center gap-2.5 text-base font-medium tracking-tight text-foreground justify-self-start">
              {icon && <span className="text-muted-foreground">{icon}</span>}
              <span className="truncate">{title}</span>
            </h1>
          ) : (
            <span />
          )}
          <div className="justify-self-center">{headerCenter}</div>
          {toolbar ? (
            <div className="flex items-center gap-2 justify-self-end">
              {toolbar}
            </div>
          ) : (
            <span />
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <main
          className={
            fullBleed
              ? 'flex-1 overflow-hidden flex flex-col min-w-0'
              : 'flex-1 overflow-auto p-4 sm:p-6 min-w-0'
          }>
          {children}
        </main>
      </div>
    </div>
  );
}
