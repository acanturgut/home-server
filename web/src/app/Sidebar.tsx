import {
  LayoutDashboard,
  MessageSquare,
  Blocks,
  Settings,
  Hexagon,
  Network,
  House,
  Printer,
  Server,
  Sparkles,
  LineChart,
  Heart,
} from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';

export interface NavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
}

/**
 * Top-level navigation items, in display order. The first 5 are also the
 * ones that show up in the mobile bottom-tab bar; the rest collapse into
 * the "More" sheet on mobile.
 */
export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: <LayoutDashboard size={20} />, label: 'Home' },
  { id: 'chat', icon: <MessageSquare size={20} />, label: 'Chat' },
  { id: 'network', icon: <Network size={20} />, label: 'Network' },
  { id: 'home', icon: <House size={20} />, label: 'Smart' },
  { id: 'apps', icon: <Blocks size={20} />, label: 'Apps' },
  { id: 'printer', icon: <Printer size={20} />, label: 'Printer' },
  { id: 'cluster', icon: <Server size={20} />, label: 'Cluster' },
  { id: 'ai', icon: <Sparkles size={20} />, label: 'AI' },
  { id: 'trader', icon: <LineChart size={20} />, label: 'Trader' },
  { id: 'villanos', icon: <Heart size={20} />, label: 'VillaOS' },
  { id: 'settings', icon: <Settings size={20} />, label: 'Settings' },
];

const MOBILE_PRIMARY = 5; // first N items appear in the bottom tab bar

interface SidebarProps {
  page: string;
  onNavigate: (id: string) => void;
  items?: NavItem[];
}

/**
 * Desktop / tablet vertical rail. Hidden below `sm`. The mobile bottom-tab
 * bar lives in `MobileNav` (rendered by App).
 */
export function Sidebar({ page, onNavigate, items = NAV_ITEMS }: SidebarProps) {
  return (
    <aside className="hidden sm:flex w-14 shrink-0 bg-muted/20 border-r border-border/30 flex-col items-center py-4 gap-1">
      <div className="mb-4 text-foreground/60 select-none">
        <Hexagon size={20} />
      </div>
      {items.map((n) => (
        <IconButton
          key={n.id}
          icon={n.icon}
          label={n.label}
          size={36}
          active={page === n.id}
          onClick={() => onNavigate(n.id)}
        />
      ))}
    </aside>
  );
}

/**
 * Mobile bottom tab bar. Shows the first 5 items + a "More" button that
 * opens a small sheet with the rest. Always visible on `<sm`.
 */
export function MobileNav({
  page,
  onNavigate,
  items = NAV_ITEMS,
}: SidebarProps) {
  const primary = items.slice(0, MOBILE_PRIMARY);
  const overflow = items.slice(MOBILE_PRIMARY);
  const inOverflow = overflow.some((n) => n.id === page);

  return (
    <nav
      className="sm:hidden shrink-0 flex items-stretch border-t border-border/30 bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary">
      {primary.map((n) => (
        <NavTab
          key={n.id}
          item={n}
          active={page === n.id}
          onClick={() => onNavigate(n.id)}
        />
      ))}
      <MoreTab
        active={inOverflow}
        items={overflow}
        currentPage={page}
        onPick={onNavigate}
      />
    </nav>
  );
}

function NavTab({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs transition-colors active:bg-white/5 ${
        active ? 'text-foreground' : 'text-muted-foreground/65'
      }`}>
      <span
        className={
          active ? 'text-primary' : 'text-muted-foreground/65'
        }>
        {item.icon}
      </span>
      {item.label}
    </button>
  );
}

import { useEffect, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

function MoreTab({
  active,
  items,
  currentPage,
  onPick,
}: {
  active: boolean;
  items: NavItem[];
  currentPage: string;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="More"
        aria-expanded={open}
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs transition-colors active:bg-white/5 ${
          active || open ? 'text-foreground' : 'text-muted-foreground/65'
        }`}>
        <span
          className={
            active || open ? 'text-primary' : 'text-muted-foreground/65'
          }>
          <MoreHorizontal size={20} />
        </span>
        More
      </button>

      {open && (
        <>
          {/* backdrop */}
          <button
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 sm:hidden"
          />
          {/* sheet */}
          <div
            role="dialog"
            aria-modal="true"
            className="fixed left-0 right-0 bottom-0 z-50 sm:hidden border-t border-border/40 bg-background rounded-t-xl pb-[env(safe-area-inset-bottom)]">
            <div className="flex justify-center pt-2">
              <div className="h-1 w-10 rounded-full bg-border" />
            </div>
            <ul className="p-2 grid grid-cols-3 gap-2">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      setOpen(false);
                      onPick(n.id);
                    }}
                    className={`w-full flex flex-col items-center gap-1.5 py-3 rounded-lg border transition-colors ${
                      currentPage === n.id
                        ? 'border-primary/40 bg-primary/10 text-foreground'
                        : 'border-border/25 bg-card/30 text-muted-foreground hover:text-foreground'
                    }`}>
                    {n.icon}
                    <span className="text-xs font-medium">{n.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
