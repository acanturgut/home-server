import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { guessIcon } from '@/lib/icons';
import { StatusDot } from '@/components/ui/status-dot';
import { LatencyTimeline } from '@/features/dashboard/components/LatencyTimeline';
import { NodeMicroCards } from '@/features/dashboard/components/NodeMicroCards';
import { TokenUsage } from '@/features/dashboard/components/TokenUsage';
import { ModelLeaderboard } from '@/features/dashboard/components/ModelLeaderboard';
import { ErrorsPanel } from '@/features/dashboard/components/ErrorsPanel';
import { NetworkTopology } from '@/features/dashboard/components/NetworkTopology';
import { OverviewBar } from '@/features/dashboard/components/OverviewBar';
import { HostGraphs } from '@/features/dashboard/components/HostGraphs';
import { ClientsList } from '@/features/dashboard/components/ClientsList';
import { HomeDevicesPanel } from '@/features/home';
import {
  DashboardDataProvider,
  useDashboardData,
} from '@/features/dashboard/hooks/useDashboardData';

/** App-store grid for dashboard. */
function AppsQuickView() {
  const { apps } = useDashboardData();

  if (apps.length === 0) return null;

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
      {apps.map((app) => {
        const icon = app.icon || guessIcon(app.name);
        const isRunning = app.status === 'running';
        const isFailed = app.status === 'failed';
        return (
          <button
            key={app.name}
            onClick={() =>
              isRunning &&
              window.open(`${API_BASE}/apps/${app.name}/`, '_blank')
            }
            className={`group relative flex flex-col items-center gap-1.5 p-2.5 rounded-lg border transition-all ${
              isRunning
                ? 'border-border/20 hover:border-primary/30 hover:bg-primary/5 cursor-pointer'
                : isFailed
                  ? 'border-red-500/15 opacity-60 cursor-default'
                  : 'border-border/15 opacity-50 cursor-default'
            }`}>
            <span className="text-2xl">{icon}</span>
            <span className="text-[10.5px] font-medium text-foreground/80 truncate w-full text-center">
              {app.name}
            </span>
            <StatusDot
              status={app.status}
              className="absolute top-1.5 right-1.5"
            />
          </button>
        );
      })}
    </div>
  );
}

function LiveIndicator() {
  const { lastTick, ready } = useDashboardData();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ageMs = lastTick ? now - lastTick : 0;
  const fresh = ready && ageMs < 8000;
  return (
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
      <span className="relative flex h-1.5 w-1.5">
        {fresh && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
        )}
        <span
          className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
            fresh ? 'bg-emerald-400' : 'bg-amber-400'
          }`}
        />
      </span>
      <span className="tabular-nums">
        {!ready ? 'connecting…' : `live · ${(ageMs / 1000).toFixed(0)}s`}
      </span>
    </div>
  );
}

/** Section heading with thin divider — groups dashboard areas visually. */
function Section({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <h3 className="text-[10px] uppercase tracking-[0.08em] font-medium text-muted-foreground/55">
          {title}
        </h3>
        <div className="flex-1 h-px bg-border/15" />
        {trailing && (
          <span className="text-[10px] text-muted-foreground/45 tabular-nums">
            {trailing}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

export function DashboardPage() {
  return (
    <DashboardDataProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground/90">
              Dashboard
            </h2>
            <p className="text-[10px] text-muted-foreground/55">
              Cluster, apps and smart-home overview
            </p>
          </div>
          <LiveIndicator />
        </div>

        {/* Row 1: Location · Public IP · LAN · Weather */}
        <OverviewBar />

        {/* Row 2: Pi (home server) — minimalist sparklines */}
        <Section title="Home Server">
          <HostGraphs />
        </Section>

        {/* Row 3: Network — topology + who's connected */}
        <Section title="Network">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <NetworkTopology />
            <ClientsList />
          </div>
        </Section>

        {/* Row 4: Smart-home (rooms) | Cluster nodes */}
        <Section title="Home & Cluster">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <HomeDevicesPanel />
            <NodeMicroCards />
          </div>
        </Section>

        {/* Apps */}
        <Section title="Apps">
          <AppsQuickView />
        </Section>

        {/* Row 5: AI stats */}
        <Section title="AI Activity">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <TokenUsage />
            </div>
            <ErrorsPanel />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <LatencyTimeline />
            </div>
            <ModelLeaderboard />
          </div>
        </Section>
      </div>
    </DashboardDataProvider>
  );
}
