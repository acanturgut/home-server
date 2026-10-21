import { useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Sidebar, MobileNav } from '@/app/Sidebar';
import { NAV_ITEMS } from '@/app/navItems';
import { StatusBar } from '@/app/StatusBar';
import { LogsOverlay } from '@/app/LogsOverlay';
import { PageLayout } from '@/app/PageLayout';
import { AIPage, ClusterPage, DashboardPage } from '@/features/dashboard';
import { HomeDevicesPanel } from '@/features/home';
import { ChatPanel } from '@/features/chat';
import { SettingsPanel } from '@/features/settings';
import { NetworkPage } from '@/app/pages/NetworkPage';
import { useSystemStatus } from '@/app/hooks/useSystemStatus';
import { useNavGoto } from '@/app/hooks/useNavGoto';
import { useRoute, pushRoute } from '@/app/routing';
import { LoginPage, useAuth } from '@/features/auth';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-dvh w-screen bg-background text-muted-foreground flex items-center justify-center">
        <Loader2 size={18} className="animate-spin" aria-label="Loading" />
      </div>
    );
  }
  return user ? <Shell /> : <LoginPage />;
}

/** Signed-in frame. Mounted only with a session, so its polling never runs on the login page. */
function Shell() {
  const route = useRoute();
  // Unknown paths (e.g. old bookmarks) land on the dashboard.
  const page = NAV_ITEMS.some((n) => n.id === route.page)
    ? route.page
    : 'dashboard';
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsPinned, setLogsPinned] = useState(false);

  const { sys, nodeCount } = useSystemStatus();
  // Sidebar / mobile-nav clicks just push a new URL.
  const navigateTo = useCallback((p: string) => pushRoute(p), []);
  // Re-dispatches nav:goto payloads (settings tab) after a page change.
  useNavGoto();

  const nav = NAV_ITEMS.find((n) => n.id === page);
  const title = nav?.label ?? 'Home Server';
  // Pages with their own internal sidebar/dock fill the frame; padded pages
  // (Dashboard, Settings) keep PageLayout's default content padding.
  const fullBleed = page === 'chat';

  return (
    <div className="h-dvh bg-background text-foreground flex flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar page={page} onNavigate={navigateTo} />

        <div className="flex-1 overflow-hidden">
          <PageLayout title={title} icon={nav?.icon} fullBleed={fullBleed}>
            {page === 'dashboard' && <DashboardPage />}
            {page === 'network' && <NetworkPage />}
            {page === 'home' && <HomeDevicesPanel />}
            {page === 'cluster' && <ClusterPage />}
            {page === 'ai' && <AIPage />}
            {page === 'chat' && <ChatPanel />}
            {page === 'settings' && <SettingsPanel />}
          </PageLayout>
        </div>
      </div>

      <LogsOverlay
        open={logsOpen}
        pinned={logsPinned}
        onTogglePin={() => setLogsPinned((v) => !v)}
        onClose={() => {
          setLogsOpen(false);
          setLogsPinned(false);
        }}
      />

      {/* Mobile bottom-tab bar (hidden on sm+) */}
      <MobileNav page={page} onNavigate={navigateTo} />

      {/* Desktop status bar (hidden on mobile to give the bottom-nav full real estate) */}
      <div className="hidden sm:block">
        <StatusBar
          sys={sys}
          nodeCount={nodeCount}
          logsOpen={logsOpen}
          onToggleLogs={() => setLogsOpen((v) => !v)}
        />
      </div>
    </div>
  );
}

export default App;
