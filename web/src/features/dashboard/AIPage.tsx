import { Section } from '@/components/ui/section';
import { TokenUsage } from '@/features/dashboard/components/TokenUsage';
import { ErrorsPanel } from '@/features/dashboard/components/ErrorsPanel';
import { LatencyTimeline } from '@/features/dashboard/components/LatencyTimeline';
import { ModelLeaderboard } from '@/features/dashboard/components/ModelLeaderboard';
import { DashboardDataProvider } from '@/features/dashboard/components/DashboardDataProvider';

/**
 * AI activity page. Two stacked sections: throughput (tokens + errors) and
 * performance (latency + model leaderboard). All grids collapse to a single
 * column on mobile.
 */
export function AIPage() {
  return (
    <DashboardDataProvider>
      <div className="space-y-6">
        <Section
          title="Throughput"
          description="Tokens, requests, and errors over the last hour.">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <TokenUsage />
            </div>
            <ErrorsPanel />
          </div>
        </Section>

        <Section
          title="Performance"
          description="Latency timeline and the most-used models.">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
