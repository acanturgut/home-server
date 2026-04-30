import {
  LayoutDashboard,
  MessageSquare,
  Blocks,
  Settings,
  Hexagon,
} from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';

export interface NavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
  { id: 'chat', icon: <MessageSquare size={18} />, label: 'Chat' },
  { id: 'apps', icon: <Blocks size={18} />, label: 'Apps' },
  { id: 'settings', icon: <Settings size={18} />, label: 'Settings' },
];

interface SidebarProps {
  page: string;
  onNavigate: (id: string) => void;
  items?: NavItem[];
}

export function Sidebar({ page, onNavigate, items = NAV_ITEMS }: SidebarProps) {
  return (
    <aside className="w-12 sm:w-14 shrink-0 bg-muted/20 border-r border-border/30 flex flex-col items-center py-3 sm:py-4 gap-1">
      {/* Logo */}
      <div className="mb-2 sm:mb-4 text-lg font-bold text-foreground/60 select-none">
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
