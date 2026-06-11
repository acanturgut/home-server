import { Section } from '@/components/ui/panel';
import { HostGraphs } from '@/features/dashboard/components/HostGraphs';
import { NodeMicroCards } from '@/features/dashboard/components/NodeMicroCards';
import { DashboardDataProvider } from '@/features/dashboard/hooks/useDashboardData';

/**
 * Cluster page: live charts for the home server (Pi) and per-node compute
 * cards (CPU/RAM/GPU/VRAM). Uses Section for grouping and the upstream
 * components for the actual rendering.
 */
export function ClusterPage() {
  return (
    <DashboardDataProvider>
      <div className="space-y-6">
        <Section
          title="Home Server"
          description="Live CPU, memory, and disk on the Raspberry Pi.">
          <HostGraphs />
        </Section>

        <Section
          title="Cluster Nodes"
          description="Inference workers, their hardware, and currently loaded models.">
          <NodeMicroCards />
        </Section>
      </div>
    </DashboardDataProvider>
  );
}
