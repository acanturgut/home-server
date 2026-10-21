import { Section } from '@/components/ui/section';
import { ClusterNodes } from '@/features/dashboard/components/ClusterNodes';
import { DashboardDataProvider } from '@/features/dashboard/components/DashboardDataProvider';
import { HostGraphs } from '@/features/dashboard/components/HostGraphs';

/** Cluster page: the home server's own load, then each compute node. */
export function ClusterPage() {
  return (
    <DashboardDataProvider cluster>
      <div className="space-y-6">
        <Section
          title="Home server"
          description="Live CPU, memory and disk on the Raspberry Pi."
        >
          <HostGraphs />
        </Section>
        <Section
          title="Cluster nodes"
          description="Inference workers, their hardware and loaded models."
        >
          <ClusterNodes />
        </Section>
      </div>
    </DashboardDataProvider>
  );
}
