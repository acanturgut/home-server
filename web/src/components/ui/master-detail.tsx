import { useState, type DragEvent, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useIsMobile } from '@/lib/routing';
import { cn } from '@/lib/utils';

interface MasterDetailItem {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  count?: number;
  icon?: ReactNode;
  /** Makes the row a drop target (e.g. drag a device onto a room). */
  onDrop?: (e: DragEvent<HTMLButtonElement>) => void;
}

/**
 * Grouped nav list beside a detail pane (Settings, Smart Home). On desktop
 * both show and `activeId ?? defaultId` is highlighted. On mobile the list
 * shows until there is an `activeId`, then the detail with a back button.
 */
export function MasterDetail({
  groups,
  activeId,
  defaultId,
  onSelect,
  backLabel,
  onBack,
  title,
  description,
  actions,
  children,
}: {
  groups: { label: string; items: MasterDetailItem[] }[];
  /** Selection from the URL; `undefined` means none. */
  activeId?: string;
  /** Item highlighted on desktop when nothing is selected. */
  defaultId: string;
  onSelect: (id: string) => void;
  /** Section name: labels the nav and the mobile back button. */
  backLabel: string;
  onBack: () => void;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const current = activeId ?? defaultId;
  return (
    <div className="flex max-w-6xl flex-col gap-6 lg:flex-row lg:gap-8">
      {(!isMobile || !activeId) && (
        <nav
          aria-label={backLabel}
          className="w-full shrink-0 space-y-5 lg:sticky lg:top-0 lg:max-h-[calc(100vh-2rem)] lg:w-64 lg:self-start lg:overflow-y-auto"
        >
          {groups
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <div key={g.label} className="space-y-1.5">
                <h3 className="px-1 text-xs font-medium text-muted-foreground">
                  {g.label}
                </h3>
                <Card className="divide-y overflow-hidden p-0">
                  {g.items.map((item) => (
                    <NavRow
                      key={item.id}
                      item={item}
                      active={!isMobile && item.id === current}
                      onSelect={() => onSelect(item.id)}
                    />
                  ))}
                </Card>
              </div>
            ))}
        </nav>
      )}

      {(!isMobile || !!activeId) && (
        <div className="min-w-0 flex-1 space-y-5">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              {isMobile && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 text-muted-foreground"
                  onClick={onBack}
                >
                  <ChevronLeft />
                  {backLabel}
                </Button>
              )}
              <h2 className="truncate text-lg font-medium text-foreground">
                {title}
              </h2>
              {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}
            </div>
            {actions && <div className="shrink-0">{actions}</div>}
          </header>
          {children}
        </div>
      )}
    </div>
  );
}

function NavRow({
  item,
  active,
  onSelect,
}: {
  item: MasterDetailItem;
  active: boolean;
  onSelect: () => void;
}) {
  const [dropHover, setDropHover] = useState(false);
  const { onDrop } = item;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      onDragOver={
        onDrop
          ? (e) => {
              e.preventDefault();
              setDropHover(true);
            }
          : undefined
      }
      onDragLeave={onDrop ? () => setDropHover(false) : undefined}
      onDrop={
        onDrop
          ? (e) => {
              e.preventDefault();
              setDropHover(false);
              onDrop(e);
            }
          : undefined
      }
      className={cn(
        'flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors outline-none focus-visible:bg-muted',
        active || dropHover ? 'bg-muted' : 'hover:bg-muted/50',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">
          {item.icon}
          <span className="truncate">{item.label}</span>
        </div>
        {item.description && (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {item.description}
          </div>
        )}
      </div>
      {item.count !== undefined && (
        <span className="mt-0.5 shrink-0 text-xs text-muted-foreground tabular-nums">
          {item.count}
        </span>
      )}
    </button>
  );
}
