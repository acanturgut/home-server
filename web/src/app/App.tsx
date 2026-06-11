import { useCallback, useState } from 'react';
import { Sidebar, MobileNav, NAV_ITEMS } from '@/app/Sidebar';
import { StatusBar } from '@/app/StatusBar';
import { LogsOverlay } from '@/app/LogsOverlay';
import { PageLayout } from '@/app/PageLayout';
import { DashboardPage } from '@/features/dashboard';
import { AppsPanel } from '@/features/apps';
import { BambuPage } from '@/features/bambu';
import { ChatPanel } from '@/features/chat';
import { SettingsPanel } from '@/features/settings';
import { NetworkPage } from '@/app/pages/NetworkPage';
import { HomePage } from '@/app/pages/HomePage';
import { ClusterPage } from '@/app/pages/ClusterPage';
import { AIPage } from '@/app/pages/AIPage';
import { TraderPage } from '@/features/trader';
import { VillanosPage } from '@/features/villanos';
import { useSystemStatus } from '@/app/hooks/useSystemStatus';
import { useNavGoto } from '@/app/hooks/useNavGoto';
import { useRoute, pushRoute } from '@/app/routing';
import { LoginPage, useAuth } from '@/features/auth';

function App() {
  const { user, loading } = useAuth();
  const route = useRoute();
  const page = route.page;
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsPinned, setLogsPinned] = useState(false);

  const { sys, nodeCount, appCount } = useSystemStatus();
  // Sidebar / mobile-nav clicks just push a new URL.
  const navigateTo = useCallback((p: string) => pushRoute(p), []);
  // Legacy nav:goto listener — payload events (chat:prefill-prompt etc.)
  // still need to fire after a page change. URL push happens inside
  // `gotoPage`; this hook just keeps the side-effect dispatchers wired.
  useNavGoto(useCallback(() => {}, []));

  if (loading) {
    return (
      <div className="dark h-screen w-screen bg-background text-foreground flex items-center justify-center text-xs text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!user) return <LoginPage />;

  const title = NAV_ITEMS.find((n) => n.id === page)?.label ?? 'Home Server';
  // Pages with their own internal sidebar/dock fill the frame; padded pages
  // (Dashboard, Settings) keep PageLayout's default content padding.
  const fullBleed = page === 'apps' || page === 'chat' || page === 'villanos';

  return (
    <div className="dark h-screen bg-background text-foreground flex flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar page={page} onNavigate={navigateTo} />

        {/* AppsPanel stays mounted to preserve build streams. */}
        <div
          className={
            page === 'apps' ? 'flex-1 overflow-hidden flex flex-col' : 'hidden'
          }>
          <AppsPanel />
        </div>

        {page !== 'apps' && (
          <div className="flex-1 overflow-hidden">
            <PageLayout title={title} fullBleed={fullBleed}>
              {page === 'dashboard' && <DashboardPage />}
              {page === 'network' && <NetworkPage />}
              {page === 'home' && <HomePage />}
              {page === 'printer' && <BambuPage />}
              {page === 'cluster' && <ClusterPage />}
              {page === 'ai' && <AIPage />}
              {page === 'trader' && <TraderPage />}
              {page === 'villanos' && <VillanosPage />}
              {page === 'chat' && <ChatPanel />}
              {page === 'settings' && <SettingsPanel />}
            </PageLayout>
          </div>
        )}
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
          appCount={appCount}
          logsOpen={logsOpen}
          onToggleLogs={() => setLogsOpen((v) => !v)}
        />
      </div>
    </div>
  );
}

export default App;
