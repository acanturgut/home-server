import { apiJsonSafe, API_BASE } from '@/lib/api';

export type HomeBridgeKind = 'hue' | 'dirigera' | 'webos' | 'http';

export interface HomeBridge {
  id: string;
  kind: HomeBridgeKind;
  name: string;
  host: string;
  token?: string;
  config?: Record<string, string>;
  added: string;
  status?: string;
  error?: string;
}

export type HomeDeviceType =
  | 'light'
  | 'plug'
  | 'sensor'
  | 'blind'
  | 'remote'
  | 'tv'
  | 'speaker'
  | 'other';

export interface HomeDevice {
  id: string;
  bridge_id: string;
  bridge_kind: HomeBridgeKind;
  local_id: string;
  name: string;
  display_name?: string;
  type: HomeDeviceType;
  room?: string;
  reachable: boolean;
  on?: boolean;
  brightness?: number;
  position?: number;
  color?: string;
  temp?: number;
  humidity?: number;
  pm25?: number;
  voc?: number;
  battery?: number;
  hidden?: boolean;
  updated: string;
}

export interface HomeSnapshot {
  devices: HomeDevice[];
  bridges: HomeBridge[];
  last_updated: string;
}

export type HomeAction =
  | { action: 'on' }
  | { action: 'off' }
  | { action: 'toggle' }
  | { action: 'brightness'; brightness: number }
  | { action: 'position'; position: number }
  | { action: 'stop' };

export interface SensorSample {
  t: string;
  temp?: number;
  humidity?: number;
  pm25?: number;
  voc?: number;
  battery?: number;
}

export interface SensorHistory {
  device_id: string;
  range: string;
  since: string;
  samples: SensorSample[];
}

export const homeApi = {
  list: () => apiJsonSafe<HomeSnapshot>('/api/home/devices'),
  bridges: () => apiJsonSafe<HomeBridge[]>('/api/home/bridges'),
  addBridge: async (b: Partial<HomeBridge>) => {
    const r = await fetch(`${API_BASE}/api/home/bridges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
    });
    if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
    return (await r.json()) as HomeBridge;
  },
  updateBridge: async (id: string, b: Partial<HomeBridge>) => {
    const r = await fetch(`${API_BASE}/api/home/bridges/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
    });
    if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
  },
  deleteBridge: async (id: string) => {
    const r = await fetch(`${API_BASE}/api/home/bridges/${id}`, {
      method: 'DELETE',
    });
    if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`);
  },
  apply: async (deviceId: string, action: HomeAction) => {
    const r = await fetch(
      `${API_BASE}/api/home/devices/${encodeURIComponent(deviceId)}/action`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      },
    );
    if (!r.ok) {
      const t = await r.text();
      throw new Error(t || `HTTP ${r.status}`);
    }
  },
  refresh: async () => {
    await fetch(`${API_BASE}/api/home/refresh`, { method: 'POST' });
  },
  history: (deviceId: string, range: '24h' | '7d' | '30d' = '24h') =>
    apiJsonSafe<SensorHistory>(
      `/api/home/devices/${encodeURIComponent(deviceId)}/history?range=${range}`,
    ),
  /**
   * Long-poll DIRIGERA pairing handshake. The server keeps the connection
   * open until the user presses the action button on the hub (or ~90s
   * timeout). Returns the long-lived access token on success.
   */
  pairDirigera: async (
    host: string,
    name = 'home-server',
    signal?: AbortSignal,
  ) => {
    const r = await fetch(`${API_BASE}/api/home/dirigera/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, name }),
      signal,
    });
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try {
        const j = (await r.json()) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        try {
          msg = (await r.text()) || msg;
        } catch {
          /* ignore */
        }
      }
      throw new Error(msg);
    }
    const j = (await r.json()) as { access_token?: string };
    if (!j.access_token) throw new Error('no access_token in response');
    return j.access_token;
  },
};
