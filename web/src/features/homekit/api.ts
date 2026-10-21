import { apiJsonSafe } from '@/lib/api';
import type { LogEntry } from '@/lib/types';

interface HKAccessory {
  id: string;
  name: string;
  mac: string;
  host: string;
}

export interface HKInfo {
  bridge: string;
  pin: string;
  port: number;
  setup_uri: string;
  accessories: HKAccessory[] | null;
}

export const homekitApi = {
  info: () => apiJsonSafe<HKInfo>('/api/homekit'),
  recentLogs: (n = 200) => apiJsonSafe<LogEntry[]>(`/api/logs?n=${n}`),
};
