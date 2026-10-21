import { lazy, Suspense, useState } from 'react';
import { Sidebar, MobileNav } from '@/app/Sidebar';
import { NAV_ITEMS } from '@/app/navItems';
import { StatusBar } from '@/app/StatusBar';
import { LogsOverlay } from '@/app/LogsOverlay';
import { PageLayout } from '@/app/PageLayout';
import { Spinner } from '@/components/ui/spinner';
import { useRoute, pushRoute } from '@/lib/routing';
import { LoginPage, useAuth } from '@/features/auth';

// Pages load on first visit so recharts, markdown etc. stay out of the entry chunk.
const DashboardPage = lazy(() =>
  import('@/features/dashboard').then((m) => ({ default: m.DashboardPage })),
);
const ClusterPage = lazy(() =>
  import('@/features/dashboard').then((m) => ({ default: m.ClusterPage })),
);
const AIPage = lazy(() =>
  import('@/features/dashboard').then((m) => ({ default: m.AIPage })),
);
const HomeDevicesPanel = lazy(() =>
  import('@/features/home').then((m) => ({ default: m.HomeDevicesPanel })),
);
const ChatPanel = lazy(() =>
  import('@/features/chat').then((m) => ({ default: m.ChatPanel })),
);
const SettingsPanel = lazy(() =>
  import('@/features/settings').then((m) => ({ default: m.SettingsPanel })),
);
const NetworkPage = lazy(() =>
  import('@/features/network').then((m) => ({ default: m.NetworkPage })),
);

function Loading() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Spinner size={18} label="Loading" />
    </div>
  );
}

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-dvh">
        <Loading />
      </div>
    );
  }
  return user ? <Shell /> : <LoginPage />;
}

/** Signed-in frame. Mounted only with a session, so its polling never runs on the login page. */
function Shell() {
  const route = useRoute();
  // Unknown paths (e.g. old bookmarks) land on the dashboard.
  const nav = NAV_ITEMS.find((n) => n.id === route.page) ?? NAV_ITEMS[0];
  const page = nav.id;
  const [logsOpen, setLogsOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar page={page} onNavigate={pushRoute} />

        <div className="flex-1 overflow-hidden">
          {/* Chat has its own rail and composer, so it fills the frame. */}
          <PageLayout
            title={nav.label}
            icon={nav.icon}
            fullBleed={page === 'chat'}
          >
            <Suspense fallback={<Loading />}>
              {page === 'dashboard' && <DashboardPage />}
              {page === 'network' && <NetworkPage />}
              {page === 'home' && <HomeDevicesPanel />}
              {page === 'cluster' && <ClusterPage />}
              {page === 'ai' && <AIPage />}
              {page === 'chat' && <ChatPanel />}
              {page === 'settings' && <SettingsPanel />}
            </Suspense>
          </PageLayout>
        </div>
      </div>

      <LogsOverlay open={logsOpen} onClose={() => setLogsOpen(false)} />

      <MobileNav page={page} onNavigate={pushRoute} />

      {/* Desktop only: the mobile bottom nav needs the space. */}
      <div className="hidden sm:block">
        <StatusBar
          logsOpen={logsOpen}
          onToggleLogs={() => setLogsOpen((v) => !v)}
        />
      </div>
    </div>
  );
}

export default App;
