import { apiJson, apiJsonSafe } from '@/lib/api';

export interface RouterConfig {
  configured: boolean;
  has_password: boolean;
  host: string;
  username: string;
  use_ssl: boolean;
  port: number;
  verify_ssl: boolean;
  timeout_sec: number;
}

export interface RouterStatus {
  hostname?: string;
  model?: string;
  firmware?: string;
  uptime_sec?: number;
  wan_status?: string;
  wan_ip?: string;
  wan_gateway?: string;
  wan_type?: string;
  lan_ip?: string;
  cpu_used_pct?: number;
  mem_used_pct?: number;
  mem_total_kb?: number;
  mem_free_kb?: number;
  wired_count?: number;
  wireless_2g_count?: number;
  wireless_5g_count?: number;
  client_count?: number;
  fetched_at: string;
}

export interface RouterClient {
  mac: string;
  ip?: string;
  hostname?: string;
  vendor?: string;
  iface?: string;
  rssi?: number;
  connect_time?: number;
  online: boolean;
  internet?: boolean;
  guest?: boolean;
  nickname?: string;
  custom_name?: string;
  blocked?: boolean;
}

interface RouterStatusResp {
  configured: boolean;
  status?: RouterStatus;
}

interface RouterClientsResp {
  configured: boolean;
  clients: RouterClient[];
}

interface RouterConfigInput {
  host: string;
  username: string;
  password?: string;
  use_ssl: boolean;
  port?: number;
  verify_ssl?: boolean;
  timeout_sec?: number;
}

export const routerApi = {
  config: () => apiJsonSafe<RouterConfig>('/api/router/config'),
  saveConfig: (cfg: RouterConfigInput) =>
    apiJson<{ saved: boolean }>('/api/router/config', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    }),
  test: () => apiJson<{ ok: boolean }>('/api/router/test', { method: 'POST' }),
  status: () => apiJsonSafe<RouterStatusResp>('/api/router/status'),
  clients: () => apiJsonSafe<RouterClientsResp>('/api/router/clients'),
  reboot: () =>
    apiJson<{ ok: boolean }>('/api/router/reboot', { method: 'POST' }),
  restartWireless: () =>
    apiJson<{ ok: boolean }>('/api/router/restart-wireless', {
      method: 'POST',
    }),
  wol: (mac: string) =>
    apiJson<{ ok: boolean }>('/api/router/wol', {
      method: 'POST',
      body: JSON.stringify({ mac }),
    }),
  block: (mac: string, blocked: boolean, name?: string) =>
    apiJson<{ ok: boolean; blocked: boolean }>('/api/router/block', {
      method: 'POST',
      body: JSON.stringify({ mac, blocked, name }),
    }),
  rename: (mac: string, name: string) =>
    apiJson<{ ok: boolean }>(`/api/network/devices/${encodeURIComponent(mac)}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    }),
};
