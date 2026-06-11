import { HomeDevicesPanel } from '@/features/home';
import { DashboardDataProvider } from '@/features/dashboard/hooks/useDashboardData';

export function HomePage() {
  return (
    <DashboardDataProvider>
      <HomeDevicesPanel />
    </DashboardDataProvider>
  );
}
