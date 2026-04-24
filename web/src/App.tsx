import './index.css';
import { useCallback, useState } from 'react';
import { Sidebar, NAV_ITEMS } from '@/components/Sidebar';
import { StatusBar } from '@/components/StatusBar';
import { LogsOverlay } from '@/components/LogsOverlay';
import { PageLayout } from '@/components/PageLayout';
import { DashboardPage } from '@/panels/DashboardPage';
import { AppsPanel } from '@/panels/AppsPanel';
import { ChatPanel } from '@/panels/ChatPanel';
import { SettingsPanel } from '@/panels/SettingsPanel';
import { useSystemStatus } from '@/lib/useSystemStatus';
import { useNavGoto } from '@/lib/useNavGoto';

function App() {
  const [page, setPage] = useState<string>('dashboard');
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsPinned, setLogsPinned] = useState(false);

  const { sys, nodeCount, appCount } = useSystemStatus();
  useNavGoto(useCallback((p: string) => setPage(p), []));

  const title = NAV_ITEMS.find((n) => n.id === page)?.label ?? 'Home Server';

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
            <PageLayout title={title}>
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
