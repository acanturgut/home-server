import { apiJson, apiJsonSafe } from '@/lib/api';

export type HomeBridgeKind = 'hue' | 'dirigera' | 'webos' | 'http';

export interface HomeBridge {
  id: string;
  kind: HomeBridgeKind;
  name: string;
  host: string;
  /** Write-only: sent on create/update, never returned by the server. On
   * update an empty token keeps the stored one. */
  token?: string;
  config?: Record<string, string>;
  added: string;
  status?: string;
  error?: string;
}

export type HomeDeviceType =
  'light' | 'plug' | 'sensor' | 'blind' | 'remote' | 'tv' | 'speaker' | 'other';

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

export type HistoryRange = '24h' | '7d' | '30d';

/** User overrides on top of what the bridge reports. Empty name clears it. */
export interface DeviceOverride {
  name?: string;
  room?: string;
  type?: HomeDeviceType;
  hidden?: boolean;
}

interface SensorHistory {
  device_id: string;
  range: string;
  since: string;
  samples: SensorSample[];
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

const device = (id: string) => `/api/home/devices/${encodeURIComponent(id)}`;

/** Exchanges a pairing handshake for a long-lived bridge token. */
const pair = (path: string, body: unknown, signal?: AbortSignal) =>
  apiJson<{ access_token?: string }>(path, {
    ...json('POST', body),
    signal,
  }).then((j) => {
    if (!j?.access_token) throw new Error('no access_token in response');
    return j.access_token;
  });

export const homeApi = {
  list: () => apiJsonSafe<HomeSnapshot>('/api/home/devices'),
  // Bridge CRUD and pairing are admin-only (viewers get 403).
  addBridge: (b: Partial<HomeBridge>) =>
    apiJson<HomeBridge>('/api/home/bridges', json('POST', b)),
  updateBridge: (id: string, b: Partial<HomeBridge>) =>
    apiJson<unknown>(`/api/home/bridges/${id}`, json('PUT', b)),
  deleteBridge: (id: string) =>
    apiJson<void>(`/api/home/bridges/${id}`, json('DELETE')),
  apply: (deviceId: string, action: HomeAction) =>
    apiJson<unknown>(`${device(deviceId)}/action`, json('POST', action)),
  setDeviceOverride: (deviceId: string, o: DeviceOverride) =>
    apiJson<unknown>(`${device(deviceId)}/override`, json('PUT', o)),
  refresh: () => apiJson<unknown>('/api/home/refresh', json('POST')),
  history: (deviceId: string, range: HistoryRange) =>
    apiJsonSafe<SensorHistory>(`${device(deviceId)}/history?range=${range}`),
  /**
   * Long-poll DIRIGERA pairing handshake. The server keeps the connection
   * open until the user presses the action button on the hub (or ~90s
   * timeout). Returns the long-lived access token on success.
   */
  pairDirigera: (host: string, name = 'home-server', signal?: AbortSignal) =>
    pair('/api/home/dirigera/pair', { host, name }, signal),
  /** Hue: press the bridge's link button first, then call this. */
  pairHue: (host: string, signal?: AbortSignal) =>
    pair('/api/home/hue/pair', { host }, signal),
};
