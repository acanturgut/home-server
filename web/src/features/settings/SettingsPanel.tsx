import type { ComponentType } from 'react';
import { MasterDetail } from '@/components/ui/master-detail';
import { UsersSettingsTab, useAuth } from '@/features/auth';
import { DNSSettingsTab } from '@/features/dns';
import { SmartHomeSettings } from '@/features/home';
import { RouterSettingsTab } from '@/features/network';
import { ApiTab } from '@/features/settings/ApiTab';
import { ApiTokensTab } from '@/features/settings/ApiTokensTab';
import { GeneralTab } from '@/features/settings/GeneralTab';
import { NodesTab } from '@/features/settings/NodesTab';
import { pushRoute, useRoute } from '@/lib/routing';

const GROUPS = ['System', 'Network', 'AI', 'Devices'] as const;

interface SettingsTab {
  /** URL sub-path: /settings/<id>. */
  id: string;
  label: string;
  description: string;
  group: (typeof GROUPS)[number];
  component: ComponentType;
  /** The server answers 403 to viewers here, so the tab is hidden. */
  adminOnly?: boolean;
}

/** Every settings tab, in nav order within its group. */
const SETTINGS_TABS: SettingsTab[] = [
  {
    id: 'general',
    label: 'General',
    description: 'Version, defaults and system info',
    group: 'System',
    component: GeneralTab,
  },
  {
    id: 'users',
    label: 'Account and users',
    description: 'Your password; admins manage accounts',
    group: 'System',
    component: UsersSettingsTab,
  },
  {
    id: 'tokens',
    label: 'API tokens',
    description: 'Bearer tokens for Shortcuts and scripts',
    group: 'System',
    component: ApiTokensTab,
    adminOnly: true,
  },
  {
    id: 'api',
    label: 'API',
    description: 'HTTP endpoint reference',
    group: 'System',
    component: ApiTab,
  },
  {
    id: 'router',
    label: 'Router',
    description: 'ASUS router credentials',
    group: 'Network',
    component: RouterSettingsTab,
  },
  {
    id: 'dns',
    label: 'DNS and ad blocking',
    description: 'Local records, blocklists and allowlists',
    group: 'Network',
    component: DNSSettingsTab,
  },
  {
    id: 'nodes',
    label: 'Nodes',
    description: 'Inference workers and their models',
    group: 'AI',
    component: NodesTab,
  },
  {
    id: 'home',
    label: 'Smart home',
    description: 'Bridges, devices and HomeKit',
    group: 'Devices',
    component: SmartHomeSettings,
  },
];

/**
 * Settings: grouped tab list beside the active tab. The tab lives in the
 * URL (/settings/<id>); unknown or forbidden ids fall back to General.
 */
export function SettingsPanel() {
  const { sub } = useRoute();
  const isAdmin = useAuth().user?.role === 'admin';
  const tabs = SETTINGS_TABS.filter((t) => isAdmin || !t.adminOnly);
  const active = tabs.find((t) => t.id === sub);
  const current = active ?? tabs[0];
  const Tab = current.component;

  return (
    <MasterDetail
      groups={GROUPS.map((group) => ({
        label: group,
        items: tabs
          .filter((t) => t.group === group)
          .map(({ id, label, description }) => ({ id, label, description })),
      }))}
      activeId={active?.id}
      defaultId={tabs[0].id}
      onSelect={(id) => pushRoute('settings', id)}
      backLabel="Settings"
      onBack={() => pushRoute('settings')}
      title={current.label}
      description={current.description}
    >
      <Tab />
    </MasterDetail>
  );
}
