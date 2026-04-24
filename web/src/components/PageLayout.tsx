import type { ReactNode } from 'react';

export interface PageLayoutProps {
  /** Page title — rendered in the top header. Hidden when omitted. */
  title?: string;
  /** Optional toolbar elements rendered at the right of the header. */
  toolbar?: ReactNode;
  /** Optional left rail (e.g. file tree, session list, app list). */
  leftRail?: ReactNode;
  /** Optional right rail (e.g. inspector, build panel). */
  rightRail?: ReactNode;
  /** Optional bottom dock rendered above the global status bar. */
  bottomDock?: ReactNode;
  /** Page content. */
  children: ReactNode;
  /**
   * When true, content fills the whole frame with no padding (used by editor
   * style pages). Defaults to false.
   */
  fullBleed?: boolean;
  /** When true, hides the header bar entirely. */
  hideHeader?: boolean;
}

/**
 * Standard page chrome shared across panels:
 *
 *   ┌──────────────────────────── header (title + toolbar) ─┐
 *   │  ┌────────┬─────────────────────────────┬──────────┐  │
 *   │  │ left   │         content             │  right   │  │
 *   │  │ rail   │                             │  rail    │  │
 *   │  └────────┴─────────────────────────────┴──────────┘  │
 *   │  ──────────────── bottom dock ──────────────────────  │
 *   └───────────────────────────────────────────────────────┘
 *
 * The outer App shell still owns the navigation sidebar, the slide-up logs
 * overlay and the global status bar.
 */
export function PageLayout({
  title,
  toolbar,
  leftRail,
  rightRail,
  bottomDock,
  children,
  fullBleed = false,
  hideHeader = false,
}: PageLayoutProps) {
  const showHeader = !hideHeader && (title || toolbar);
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {showHeader && (
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/20 px-6 py-3 shrink-0 flex items-center justify-between gap-4">
          {title ? (
            <h1 className="text-sm font-semibold tracking-wide text-foreground/80">
              {title}
            </h1>
          ) : (
            <span />
          )}
          {toolbar && (
            <div className="flex items-center gap-2">{toolbar}</div>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {leftRail && (
          <aside className="shrink-0 border-r border-border/20 overflow-auto">
            {leftRail}
          </aside>
        )}
        <main
          className={
            fullBleed
              ? 'flex-1 overflow-hidden flex flex-col'
              : 'flex-1 overflow-auto p-6'
          }>
          {children}
        </main>
        {rightRail && (
          <aside className="shrink-0 border-l border-border/20 overflow-auto">
            {rightRail}
          </aside>
        )}
      </div>

      {bottomDock && (
        <div className="shrink-0 border-t border-border/20 overflow-hidden">
          {bottomDock}
        </div>
      )}
    </div>
  );
}
