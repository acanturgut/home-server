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
  { id: 'dashboard', icon: <LayoutDashboard size={20} />, label: 'Home' },
  { id: 'chat', icon: <MessageSquare size={20} />, label: 'Chat' },
  { id: 'network', icon: <Network size={20} />, label: 'Network' },
  { id: 'home', icon: <House size={20} />, label: 'Smart' },
  { id: 'cluster', icon: <Server size={20} />, label: 'Cluster' },
  { id: 'ai', icon: <Sparkles size={20} />, label: 'AI' },
  { id: 'settings', icon: <Settings size={20} />, label: 'Settings' },
];
