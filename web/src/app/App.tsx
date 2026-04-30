import { useCallback, useState } from 'react';
import { Sidebar, NAV_ITEMS } from '@/app/Sidebar';
import { StatusBar } from '@/app/StatusBar';
import { LogsOverlay } from '@/app/LogsOverlay';
import { PageLayout } from '@/app/PageLayout';
import { DashboardPage } from '@/features/dashboard';
import { AppsPanel } from '@/features/apps';
import { ChatPanel } from '@/features/chat';
import { SettingsPanel } from '@/features/settings';
import { useSystemStatus } from '@/app/hooks/useSystemStatus';
import { useNavGoto } from '@/app/hooks/useNavGoto';

function App() {
  const [page, setPage] = useState<string>('dashboard');
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsPinned, setLogsPinned] = useState(false);

  const { sys, nodeCount, appCount } = useSystemStatus();
  useNavGoto(useCallback((p: string) => setPage(p), []));

  const title = NAV_ITEMS.find((n) => n.id === page)?.label ?? 'Home Server';
  // Pages with their own internal sidebar/dock fill the frame; padded pages
  // (Dashboard, Settings) keep PageLayout's default content padding.
  const fullBleed = page === 'apps' || page === 'chat';

  return (
    <div className="dark h-screen bg-background text-foreground flex flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar page={page} onNavigate={setPage} />

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

      <StatusBar
        sys={sys}
        nodeCount={nodeCount}
        appCount={appCount}
        logsOpen={logsOpen}
        onToggleLogs={() => setLogsOpen((v) => !v)}
      />
    </div>
  );
}

export default App;
