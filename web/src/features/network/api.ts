import { apiJsonSafe, API_BASE } from '@/lib/api';

export interface NetworkDevice {
  ip: string;
  mac: string;
  hostname?: string;
  custom_name?: string;
  vendor?: string;
  iface?: string;
  online: boolean;
}

export interface NetworkScan {
  devices: NetworkDevice[];
  gateway?: string;
  self_ip?: string;
  scanned_at: string;
}

export const networkApi = {
  list: () => apiJsonSafe<NetworkScan>('/api/network/devices'),
  rename: async (mac: string, name: string) => {
    const r = await fetch(
      `${API_BASE}/api/network/devices/${encodeURIComponent(mac)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      },
    );
    if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
  },
};
