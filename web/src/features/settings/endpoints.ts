/** One route in the Settings → API explorer. */
export interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  summary: string;
  group: string;
  body?: string;
  /** `{name}` segments of `path`, filled in by the explorer. */
  pathParams: string[];
  queryParams?: { name: string; default?: string }[];
}

type Row = [
  method: Endpoint['method'],
  path: string,
  summary: string,
  extra?: Pick<Endpoint, 'queryParams'> & { body?: unknown },
];

function group(name: string, rows: Row[]): Endpoint[] {
  return rows.map(([method, path, summary, extra]) => ({
    group: name,
    method,
    path,
    summary,
    pathParams: [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
    queryParams: extra?.queryParams,
    body:
      extra?.body === undefined
        ? undefined
        : JSON.stringify(extra.body, null, 2),
  }));
}

/** Every route in `server/api/router.go`. Add new routes here too. */
export const ENDPOINTS: Endpoint[] = [
  ...group('Health & config', [
    ['GET', '/api/health', 'Ollama and compute-node reachability'],
    ['GET', '/api/config', 'Server configuration and uptime'],
    [
      'PUT',
      '/api/config',
      'Change the intent-classifier model',
      { body: { router_model: 'gemma3:1b' } },
    ],
    [
      'GET',
      '/api/logs',
      'Recent server log entries',
      { queryParams: [{ name: 'n', default: '50' }] },
    ],
    ['GET', '/api/system', 'Host CPU, memory, disk and uptime'],
    ['GET', '/api/system/history', 'Last 5 minutes of host metrics'],
    ['GET', '/api/homekit', 'HomeKit bridge, accessories and pairing code'],
  ]),
  ...group('Compute nodes', [
    ['GET', '/api/nodes', 'List compute nodes'],
    [
      'POST',
      '/api/nodes',
      'Add a compute node',
      {
        body: {
          name: 'gpu-box',
          host: 'http://192.168.50.100:1234',
          tier: 'high-end',
          mac: 'aa:bb:cc:dd:ee:ff',
        },
      },
    ],
    [
      'PUT',
      '/api/nodes/{id}',
      'Update a node (omitted fields keep their value)',
      { body: { name: 'gpu-box' } },
    ],
    ['DELETE', '/api/nodes/{id}', 'Delete a node'],
    ['POST', '/api/nodes/{id}/wake', 'Send a Wake-on-LAN packet'],
    [
      'POST',
      '/api/nodes/{id}/shutdown',
      "Queue a shutdown for the node's agent",
    ],
    ['GET', '/api/nodes/{id}/models', 'Models available on the node'],
    [
      'GET',
      '/api/nodes/{id}/models/status',
      'Models on the node and which are loaded',
    ],
    [
      'POST',
      '/api/nodes/{id}/models/load',
      'Load a model in LM Studio',
      { body: { model: 'qwen2.5-coder-7b-instruct' } },
    ],
    [
      'POST',
      '/api/nodes/{id}/models/unload',
      'Unload a model from LM Studio',
      { body: { model: 'qwen2.5-coder-7b-instruct' } },
    ],
    ['GET', '/api/nodes/stats', 'Latest agent telemetry per node'],
    [
      'POST',
      '/api/agent/heartbeat',
      'Agent heartbeat; returns queued commands',
      { body: { node_id: 'gpu-box', hostname: 'gpu-box', cpu_usage: 12.5 } },
    ],
  ]),
  ...group('Smart home', [
    ['GET', '/api/home/bridges', 'List bridges (admin)'],
    [
      'POST',
      '/api/home/bridges',
      'Add a bridge (admin)',
      { body: { kind: 'hue', host: '192.168.50.10', token: '' } },
    ],
    [
      'PUT',
      '/api/home/bridges/{id}',
      'Update a bridge; a blank token keeps the current one (admin)',
      { body: { name: 'Living room hub' } },
    ],
    ['DELETE', '/api/home/bridges/{id}', 'Delete a bridge (admin)'],
    [
      'POST',
      '/api/home/hue/pair',
      'Mint a Hue app key after pressing the link button (admin)',
      { body: { host: '192.168.50.10' } },
    ],
    [
      'POST',
      '/api/home/dirigera/pair',
      'Pair a DIRIGERA hub; waits for the action button (admin)',
      { body: { host: '192.168.50.20' } },
    ],
    ['GET', '/api/home/devices', 'All devices with room, type and state'],
    [
      'POST',
      '/api/home/devices/{id}/action',
      'Control a device: on, off, toggle, brightness, position',
      { body: { action: 'brightness', brightness: 60 } },
    ],
    [
      'PUT',
      '/api/home/devices/{id}/override',
      'Set display name, room, type or hidden',
      { body: { name: '', room: 'Living room', type: 'light', hidden: false } },
    ],
    [
      'GET',
      '/api/home/devices/{id}/history',
      'Sensor history',
      { queryParams: [{ name: 'range', default: '24h' }] },
    ],
    ['POST', '/api/home/refresh', 'Poll every bridge now'],
  ]),
  ...group('Network', [
    ['GET', '/api/network/devices', 'LAN devices from the ARP table'],
    [
      'PUT',
      '/api/network/devices/{mac}',
      'Name a LAN device (blank name clears it)',
      { body: { name: 'Living room TV' } },
    ],
  ]),
  ...group('Router', [
    ['GET', '/api/router/config', 'Router connection settings'],
    [
      'PUT',
      '/api/router/config',
      'Save router credentials',
      {
        body: {
          host: '192.168.50.1',
          username: 'admin',
          password: '',
          use_ssl: false,
        },
      },
    ],
    ['POST', '/api/router/test', 'Test the saved credentials'],
    ['GET', '/api/router/status', 'Router status (WAN, CPU, memory)'],
    ['GET', '/api/router/clients', 'Connected clients and blocked state'],
    ['POST', '/api/router/reboot', 'Reboot the router'],
    ['POST', '/api/router/restart-wireless', 'Restart the Wi-Fi radios'],
    [
      'POST',
      '/api/router/wol',
      'Wake a device through the router',
      { body: { mac: 'aa:bb:cc:dd:ee:ff' } },
    ],
    [
      'POST',
      '/api/router/block',
      "Block or unblock a device's internet access",
      { body: { mac: 'aa:bb:cc:dd:ee:ff', blocked: true } },
    ],
  ]),
  ...group('DNS', [
    ['GET', '/api/dns/status', 'DNS server status and counters'],
    ['GET', '/api/dns/records', 'Local DNS records'],
    [
      'POST',
      '/api/dns/records',
      'Add a record',
      { body: { name: 'nas.home.lan', type: 'A', value: '192.168.50.5' } },
    ],
    [
      'PUT',
      '/api/dns/records',
      'Replace all records',
      { body: [{ name: 'nas.home.lan', type: 'A', value: '192.168.50.5' }] },
    ],
    [
      'DELETE',
      '/api/dns/records',
      'Delete a record',
      { body: { name: 'nas.home.lan', type: 'A', value: '192.168.50.5' } },
    ],
  ]),
  ...group('Ad-blocker', [
    ['GET', '/api/dns/blocklist', 'Ad-blocker status, sources and allowlist'],
    [
      'PUT',
      '/api/dns/blocklist',
      'Turn the ad-blocker on or off',
      { body: { enabled: true } },
    ],
    [
      'POST',
      '/api/dns/blocklist/sources',
      'Add a hosts-format source',
      {
        body: {
          name: 'StevenBlack unified',
          url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
        },
      },
    ],
    [
      'DELETE',
      '/api/dns/blocklist/sources',
      'Remove a source',
      { body: { url: 'https://example.com/hosts' } },
    ],
    [
      'PUT',
      '/api/dns/blocklist/sources/toggle',
      'Enable or disable a source',
      { body: { url: 'https://example.com/hosts', enabled: false } },
    ],
    ['POST', '/api/dns/blocklist/refresh', 'Re-download all sources'],
    [
      'POST',
      '/api/dns/blocklist/allow',
      'Allow a domain and its subdomains',
      { body: { domain: 'example.com' } },
    ],
    [
      'DELETE',
      '/api/dns/blocklist/allow',
      'Remove a domain from the allowlist',
      { body: { domain: 'example.com' } },
    ],
  ]),
  ...group('Auth & users', [
    [
      'POST',
      '/api/auth/login',
      'Sign in (sets the session cookie)',
      { body: { username: 'admin', password: '' } },
    ],
    ['POST', '/api/auth/logout', 'Sign out'],
    ['GET', '/api/auth/me', 'Current user'],
    [
      'POST',
      '/api/auth/change-password',
      'Change your password (signs out other sessions)',
      { body: { current: '', new: '' } },
    ],
    ['GET', '/api/auth/users', 'List users (admin)'],
    [
      'POST',
      '/api/auth/users',
      'Create a user (admin)',
      { body: { username: 'guest', password: '', role: 'viewer' } },
    ],
    [
      'PUT',
      '/api/auth/users/{id}/role',
      'Change a role (admin)',
      { body: { role: 'admin' } },
    ],
    [
      'PUT',
      '/api/auth/users/{id}/password',
      'Reset a password (admin)',
      { body: { new: '' } },
    ],
    ['DELETE', '/api/auth/users/{id}', 'Delete a user (admin)'],
  ]),
  ...group('Dashboard', [
    ['GET', '/api/dashboard/overview', 'Location, public IP and weather'],
    ['GET', '/api/dashboard/cluster', 'Cluster-wide CPU, GPU and memory'],
  ]),
  ...group('Chat & assistant', [
    [
      'POST',
      '/api/chat',
      'Chat (one reply)',
      { body: { messages: [{ role: 'user', content: 'Hello!' }] } },
    ],
    [
      'POST',
      '/api/chat/stream',
      'Chat with streamed progress (NDJSON)',
      {
        body: {
          messages: [{ role: 'user', content: 'Hello!' }],
          route: 'auto',
        },
      },
    ],
    ['GET', '/api/chats', 'Saved chat sessions'],
    ['PUT', '/api/chats', 'Replace saved chat sessions', { body: [] }],
    ['GET', '/api/settings', 'Assistant settings'],
    [
      'PUT',
      '/api/settings',
      'Update assistant settings',
      { body: { defaultTemperature: 0.7 } },
    ],
    ['POST', '/api/settings/reset', 'Reset assistant settings'],
  ]),
];
