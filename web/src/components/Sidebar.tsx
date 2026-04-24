import {
  LayoutDashboard,
  MessageSquare,
  Blocks,
  Settings,
  Hexagon,
} from 'lucide-react';

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
    <aside className="w-14 shrink-0 bg-muted/20 border-r border-border/30 flex flex-col items-center py-4 gap-1">
      {/* Logo */}
      <div className="mb-4 text-lg font-bold text-foreground/60 select-none">
        <Hexagon size={20} />
      </div>
      {items.map((n) => (
        <button
          key={n.id}
          onClick={() => onNavigate(n.id)}
          title={n.label}
          className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm transition-all ${
            page === n.id
              ? 'bg-foreground/10 text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
          }`}>
          {n.icon}
        </button>
      ))}
    </aside>
  );
}
