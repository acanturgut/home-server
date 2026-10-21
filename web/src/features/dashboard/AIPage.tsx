import { Section } from '@/components/ui/section';
import { DashboardDataProvider } from '@/features/dashboard/components/DashboardDataProvider';
import { ErrorsPanel } from '@/features/dashboard/components/ErrorsPanel';
import { LatencyTimeline } from '@/features/dashboard/components/LatencyTimeline';
import { ModelLeaderboard } from '@/features/dashboard/components/ModelLeaderboard';
import { TokenUsage } from '@/features/dashboard/components/TokenUsage';

/** AI activity from the recent server logs: throughput, errors, latency, models. */
export function AIPage() {
  return (
    <DashboardDataProvider logs>
      <div className="space-y-6">
        <Section
          title="Throughput"
          description="Tokens, requests and errors in the recent logs."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <TokenUsage />
            </div>
            <ErrorsPanel />
          </div>
        </Section>
        <Section
          title="Performance"
          description="Latency over time and the most-used models."
        >
          <div className="space-y-4">
            <LatencyTimeline />
            <ModelLeaderboard />
          </div>
        </Section>
      </div>
    </DashboardDataProvider>
  );
}
