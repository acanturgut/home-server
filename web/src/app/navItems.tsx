import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  Settings,
  Network,
  House,
  Server,
  Sparkles,
} from 'lucide-react';

export interface NavItem {
  id: string;
  icon: ReactNode;
  label: string;
}

/**
 * Top-level navigation items, in display order. The first 5 are also the
 * ones that show up in the mobile bottom-tab bar; the rest collapse into
 * the "More" sheet on mobile.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    icon: <LayoutDashboard className="size-5" />,
    label: 'Home',
  },
  { id: 'chat', icon: <MessageSquare className="size-5" />, label: 'Chat' },
  { id: 'network', icon: <Network className="size-5" />, label: 'Network' },
  { id: 'home', icon: <House className="size-5" />, label: 'Smart' },
  { id: 'cluster', icon: <Server className="size-5" />, label: 'Cluster' },
  { id: 'ai', icon: <Sparkles className="size-5" />, label: 'AI' },
  { id: 'settings', icon: <Settings className="size-5" />, label: 'Settings' },
];
