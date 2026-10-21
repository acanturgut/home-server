import { useEffect, useState } from 'react';
import { LogOut, MoreHorizontal } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { NAV_ITEMS, type NavItem } from '@/app/navItems';
import { useAuth } from '@/features/auth';

const MOBILE_PRIMARY = 5; // first N items appear in the bottom tab bar

interface SidebarProps {
  page: string;
  onNavigate: (id: string) => void;
}

/**
 * Desktop / tablet icon rail. Hidden below `sm`. Settings and sign-out sit
 * at the bottom; everything else stacks from the top. The mobile bottom-tab
 * bar lives in `MobileNav` (rendered by App).
 */
export function Sidebar({ page, onNavigate }: SidebarProps) {
  const { logout } = useAuth();
  const top = NAV_ITEMS.filter((n) => n.id !== 'settings');
  const settings = NAV_ITEMS.find((n) => n.id === 'settings');

  const item = (n: NavItem) => (
    <IconButton
      key={n.id}
      icon={n.icon}
      label={n.label}
      size={40}
      className="rounded-xl"
      active={page === n.id}
      aria-current={page === n.id ? 'page' : undefined}
      onClick={() => onNavigate(n.id)}
    />
  );

  return (
    <nav
      aria-label="Primary"
      className="hidden sm:flex w-16 shrink-0 flex-col items-center gap-1 py-4">
      {top.map(item)}
      <div className="mt-auto flex flex-col items-center gap-1">
        {settings && item(settings)}
        <IconButton
          icon={<LogOut size={18} />}
          label="Sign out"
          size={40}
          className="rounded-xl"
          onClick={() => void logout()}
        />
      </div>
    </nav>
  );
}

/**
 * Mobile bottom tab bar: icons only. Shows the first 5 items + a "More"
 * button that opens a small sheet with the rest. Always visible on `<sm`.
 */
export function MobileNav({ page, onNavigate }: SidebarProps) {
  const primary = NAV_ITEMS.slice(0, MOBILE_PRIMARY);
  const overflow = NAV_ITEMS.slice(MOBILE_PRIMARY);
  const inOverflow = overflow.some((n) => n.id === page);

  return (
    <nav
      className="sm:hidden shrink-0 flex items-stretch bg-background pb-[env(safe-area-inset-bottom)]"
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
      className={`flex-1 flex items-center justify-center py-3.5 transition-colors ${
        active ? 'text-foreground' : 'text-muted-foreground/60'
      }`}>
      {item.icon}
    </button>
  );
}

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
        className={`flex-1 flex items-center justify-center py-3.5 transition-colors ${
          active || open ? 'text-foreground' : 'text-muted-foreground/60'
        }`}>
        <MoreHorizontal size={20} />
      </button>

      {open && (
        <>
          {/* backdrop */}
          <button
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/70 sm:hidden"
          />
          {/* sheet */}
          <div
            role="dialog"
            aria-modal="true"
            className="fixed left-0 right-0 bottom-0 z-50 sm:hidden bg-background rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
            <ul className="p-3 grid grid-cols-3 gap-2">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      setOpen(false);
                      onPick(n.id);
                    }}
                    className={`w-full flex flex-col items-center gap-1.5 py-4 rounded-xl transition-colors ${
                      currentPage === n.id
                        ? 'bg-foreground/10 text-foreground'
                        : 'bg-muted/40 text-muted-foreground hover:text-foreground'
                    }`}>
                    {n.icon}
                    <span className="text-xs">{n.label}</span>
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
