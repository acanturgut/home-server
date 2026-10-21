import { apiJson, apiJsonSafe } from '@/lib/api';

export interface DNSRecord {
  name: string;
  type: 'A' | 'AAAA' | 'CNAME';
  value: string;
  ttl?: number;
}

export interface DNSStatus {
  running: boolean;
  bind_addr: string;
  upstreams: string[];
  started_at?: string;
  last_error?: string;
  queries: number;
  local_hits: number;
  forwarded: number;
  upstream_errors: number;
  blocked_hits: number;
  record_count: number;
}

interface BlocklistSource {
  name: string;
  url: string;
  enabled: boolean;
  last_updated?: string;
  last_error?: string;
  entries: number;
}

export interface BlocklistStatus {
  enabled: boolean;
  blocked_count: number;
  blocked_hits: number;
  last_refreshed?: string;
  refreshing: boolean;
  sources: BlocklistSource[];
  allowlist: string[];
}

export const dnsApi = {
  /** This host's LAN IP, for the router setup guide ('' when unknown). */
  hostIp: () =>
    apiJsonSafe<{ local_ip?: string }>('/api/dashboard/overview').then(
      (d) => d?.local_ip ?? '',
    ),
  status: () => apiJsonSafe<DNSStatus>('/api/dns/status'),
  records: () => apiJsonSafe<DNSRecord[]>('/api/dns/records'),
  add: (rec: DNSRecord) =>
    apiJson<{ ok: boolean }>('/api/dns/records', {
      method: 'POST',
      body: JSON.stringify(rec),
    }),
  remove: (rec: { name: string; type: string; value?: string }) =>
    apiJson<{ ok: boolean }>('/api/dns/records', {
      method: 'DELETE',
      body: JSON.stringify(rec),
    }),
  blocklist: {
    status: () => apiJsonSafe<BlocklistStatus>('/api/dns/blocklist'),
    setEnabled: (enabled: boolean) =>
      apiJson<{ ok: boolean }>('/api/dns/blocklist', {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      }),
    addSource: (name: string, url: string) =>
      apiJson<{ ok: boolean }>('/api/dns/blocklist/sources', {
        method: 'POST',
        body: JSON.stringify({ name, url }),
      }),
    removeSource: (url: string) =>
      apiJson<{ ok: boolean }>('/api/dns/blocklist/sources', {
        method: 'DELETE',
        body: JSON.stringify({ url }),
      }),
    toggleSource: (url: string, enabled: boolean) =>
      apiJson<{ ok: boolean }>('/api/dns/blocklist/sources/toggle', {
        method: 'PUT',
        body: JSON.stringify({ url, enabled }),
      }),
    refresh: () =>
      apiJson<{ ok: boolean }>('/api/dns/blocklist/refresh', {
        method: 'POST',
      }),
    addAllow: (domain: string) =>
      apiJson<{ ok: boolean }>('/api/dns/blocklist/allow', {
        method: 'POST',
        body: JSON.stringify({ domain }),
      }),
    removeAllow: (domain: string) =>
      apiJson<{ ok: boolean }>('/api/dns/blocklist/allow', {
        method: 'DELETE',
        body: JSON.stringify({ domain }),
      }),
  },
};
