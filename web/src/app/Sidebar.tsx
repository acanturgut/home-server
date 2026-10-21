import { useState } from 'react';
import { LogOut, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, type NavItem } from '@/app/navItems';
import { useAuth } from '@/features/auth';

const MOBILE_PRIMARY = 5; // first N items appear in the bottom tab bar

interface SidebarProps {
  page: string;
  onNavigate: (id: string) => void;
}

/**
 * Desktop / tablet icon rail, hidden below `sm`. Settings and sign-out sit
 * at the bottom; everything else stacks from the top.
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
      size="lg"
      active={page === n.id}
      aria-current={page === n.id ? 'page' : undefined}
      onClick={() => onNavigate(n.id)}
    />
  );

  return (
    <nav
      aria-label="Primary"
      className="hidden w-16 shrink-0 flex-col items-center gap-1 py-4 sm:flex"
    >
      {top.map(item)}
      <div className="mt-auto flex flex-col items-center gap-1">
        {settings && item(settings)}
        <IconButton
          icon={<LogOut />}
          label="Sign out"
          size="lg"
          onClick={() => void logout()}
        />
      </div>
    </nav>
  );
}

/**
 * Mobile bottom tab bar (below `sm`): the first five items as icons plus a
 * "More" button that opens a drawer with the rest.
 */
export function MobileNav({ page, onNavigate }: SidebarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = NAV_ITEMS.slice(0, MOBILE_PRIMARY);
  const overflow = NAV_ITEMS.slice(MOBILE_PRIMARY);
  const inOverflow = overflow.some((n) => n.id === page);

  const tab = 'h-auto flex-1 rounded-none py-3.5 hover:bg-transparent';
  const tone = (on: boolean) =>
    on ? 'text-foreground' : 'text-muted-foreground';

  return (
    <nav
      aria-label="Primary"
      className="flex shrink-0 items-stretch bg-card pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      {primary.map((n) => (
        <Button
          key={n.id}
          variant="ghost"
          aria-label={n.label}
          aria-current={page === n.id ? 'page' : undefined}
          className={cn(tab, tone(page === n.id))}
          onClick={() => onNavigate(n.id)}
        >
          {n.icon}
        </Button>
      ))}
      <Button
        variant="ghost"
        aria-label="More"
        aria-haspopup="dialog"
        className={cn(tab, tone(inOverflow || moreOpen))}
        onClick={() => setMoreOpen(true)}
      >
        <MoreHorizontal className="size-5" />
      </Button>

      <Drawer open={moreOpen} onOpenChange={setMoreOpen} title="More">
        <ul className="grid grid-cols-3 gap-2">
          {overflow.map((n) => (
            <li key={n.id}>
              <Button
                variant="ghost"
                aria-current={page === n.id ? 'page' : undefined}
                className={cn(
                  'h-auto w-full flex-col gap-1.5 py-4',
                  page === n.id ? 'bg-muted text-foreground' : tone(false),
                )}
                onClick={() => {
                  setMoreOpen(false);
                  onNavigate(n.id);
                }}
              >
                {n.icon}
                <span className="text-xs">{n.label}</span>
              </Button>
            </li>
          ))}
        </ul>
      </Drawer>
    </nav>
  );
}
