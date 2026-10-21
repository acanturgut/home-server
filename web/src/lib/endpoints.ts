import type { Endpoint } from './types';

/** Static catalogue of API endpoints rendered by the API explorer panel.
 *
 * Kept in sync with `server/api/router.go`. When you add a new route there,
 * add a matching entry here so it shows up in Settings → API. */
export const ENDPOINTS: Endpoint[] = [
  // ── Health & config ────────────────────────────────────────────
  {
    group: 'Health & config',
    method: 'GET',
    path: '/api/health',
    summary: 'System health, Ollama status & node online/offline',
  },
  {
    group: 'Health & config',
    method: 'GET',
    path: '/api/config',
    summary: 'Current server configuration (router model, ollama host)',
  },
  {
    group: 'Health & config',
    method: 'PUT',
    path: '/api/config',
    summary: 'Update server config (e.g. router model)',
    body: JSON.stringify({ router_model: 'gemma3:1b' }, null, 2),
  },
  {
    group: 'Health & config',
    method: 'GET',
    path: '/api/logs',
    summary: 'Recent server logs',
    queryParams: [{ name: 'n', default: '50' }],
  },
  {
    group: 'Health & config',
    method: 'GET',
    path: '/api/system',
    summary: 'Host CPU / memory / disk / temperature snapshot',
  },
  {
    group: 'Health & config',
    method: 'GET',
    path: '/api/system/history',
    summary: 'Time-series of system metrics (last 60 samples)',
  },
  {
    group: 'Health & config',
    method: 'GET',
    path: '/api/homekit',
    summary: 'HomeKit pairing status & QR code',
  },

  // ── Compute nodes ──────────────────────────────────────────────
  {
    group: 'Compute nodes',
    method: 'GET',
    path: '/api/nodes',
    summary: 'List all compute nodes',
  },
  {
    group: 'Compute nodes',
    method: 'POST',
    path: '/api/nodes',
    summary: 'Add a new compute node',
    body: JSON.stringify(
      {
        name: 'My PC',
        host: 'http://192.168.50.100:1234',
        tier: 'high-end',
        gpu: 'RTX 4090',
        mac: '',
        model: '',
      },
      null,
      2,
    ),
  },
  {
    group: 'Compute nodes',
    method: 'PUT',
    path: '/api/nodes/{id}',
    summary: 'Update a compute node',
    pathParams: ['id'],
    body: JSON.stringify(
      {
        name: 'My PC',
        host: 'http://192.168.50.100:1234',
        tier: 'high-end',
        gpu: 'RTX 4090',
        mac: '',
        model: '',
      },
      null,
      2,
    ),
  },
  {
    group: 'Compute nodes',
    method: 'DELETE',
    path: '/api/nodes/{id}',
    summary: 'Delete a compute node',
    pathParams: ['id'],
  },
  {
    group: 'Compute nodes',
    method: 'POST',
    path: '/api/nodes/{id}/wake',
    summary: 'Send Wake-on-LAN magic packet',
    pathParams: ['id'],
  },
  {
    group: 'Compute nodes',
    method: 'POST',
    path: '/api/nodes/{id}/shutdown',
    summary: 'SSH shutdown the node (uses stored credentials)',
    pathParams: ['id'],
  },
  {
    group: 'Compute nodes',
    method: 'GET',
    path: '/api/nodes/{id}/models',
    summary: 'List models on a node (LM Studio)',
    pathParams: ['id'],
  },
  {
    group: 'Compute nodes',
    method: 'GET',
    path: '/api/nodes/{id}/models/status',
    summary: 'Loaded vs available model status for a node',
    pathParams: ['id'],
  },
  {
    group: 'Compute nodes',
    method: 'POST',
    path: '/api/nodes/{id}/models/load',
    summary: 'Load a model into LM Studio (JIT via dummy chat)',
    pathParams: ['id'],
    body: JSON.stringify({ model: 'qwen2.5-coder-7b-instruct' }, null, 2),
  },
  {
    group: 'Compute nodes',
    method: 'POST',
    path: '/api/nodes/{id}/models/unload',
    summary: 'Unload a model from LM Studio',
    pathParams: ['id'],
    body: JSON.stringify({ model: 'qwen2.5-coder-7b-instruct' }, null, 2),
  },
  {
    group: 'Compute nodes',
    method: 'GET',
    path: '/api/nodes/stats',
    summary: 'Live aggregate stats across all nodes',
  },
  {
    group: 'Compute nodes',
    method: 'POST',
    path: '/api/agent/heartbeat',
    summary: 'Heartbeat endpoint for the home-agent installer',
  },

  // ── Smart home (devices & bridges) ─────────────────────────────
  {
    group: 'Smart home',
    method: 'GET',
    path: '/api/home/bridges',
    summary: 'List configured bridges (Hue / Dirigera / webOS / generic HTTP)',
  },
  {
    group: 'Smart home',
    method: 'POST',
    path: '/api/home/bridges',
    summary: 'Add a new home bridge',
    body: JSON.stringify(
      { kind: 'hue', host: '192.168.50.10', token: '' },
      null,
      2,
    ),
  },
  {
    group: 'Smart home',
    method: 'PUT',
    path: '/api/home/bridges/{id}',
    summary: 'Update an existing bridge',
    pathParams: ['id'],
    body: JSON.stringify(
      { kind: 'hue', host: '192.168.50.10', token: '' },
      null,
      2,
    ),
  },
  {
    group: 'Smart home',
    method: 'DELETE',
    path: '/api/home/bridges/{id}',
    summary: 'Delete a bridge',
    pathParams: ['id'],
  },
  {
    group: 'Smart home',
    method: 'POST',
    path: '/api/home/dirigera/pair',
    summary: 'Long-poll pairing handshake for an IKEA Dirigera hub',
    body: JSON.stringify({ host: '192.168.50.20' }, null, 2),
  },
  {
    group: 'Smart home',
    method: 'GET',
    path: '/api/home/devices',
    summary:
      'List all smart-home devices (lights, blinds, plugs, sensors, TVs) with room, type, state and capabilities',
  },
  {
    group: 'Smart home',
    method: 'POST',
    path: '/api/home/devices/{id}/action',
    summary:
      'Send a control action to a device (on/off, brightness, color, position, etc.)',
    pathParams: ['id'],
    body: JSON.stringify({ on: true }, null, 2),
  },
  {
    group: 'Smart home',
    method: 'PUT',
    path: '/api/home/devices/{id}/override',
    summary: 'Set per-device room / type / hidden / display name override',
    pathParams: ['id'],
    body: JSON.stringify(
      { room: 'Living room', type: 'light', hidden: false, display_name: '' },
      null,
      2,
    ),
  },
  {
    group: 'Smart home',
    method: 'POST',
    path: '/api/home/refresh',
    summary: 'Force an immediate poll of all bridges',
  },

  // ── Network discovery ──────────────────────────────────────────
  {
    group: 'Network',
    method: 'GET',
    path: '/api/network/devices',
    summary: 'LAN devices from ARP table + reverse DNS',
  },
  {
    group: 'Network',
    method: 'PUT',
    path: '/api/network/devices/{mac}',
    summary: 'Rename / annotate a network device by MAC',
    pathParams: ['mac'],
    body: JSON.stringify({ name: 'Living room TV' }, null, 2),
  },

  // ── Dashboard overview ─────────────────────────────────────────
  {
    group: 'Dashboard',
    method: 'GET',
    path: '/api/dashboard/overview',
    summary:
      'Aggregated host overview: location, public IP, weather, cluster summary, recent clients',
  },
  {
    group: 'Dashboard',
    method: 'GET',
    path: '/api/dashboard/cluster',
    summary: 'Cluster aggregate (CPU/GPU/RAM totals + per-node tier breakdown)',
  },
  {
    group: 'Dashboard',
    method: 'GET',
    path: '/api/dashboard/clients',
    summary: 'Recent web clients that have hit the dashboard',
  },

  // ── Chat ───────────────────────────────────────────────────────
  {
    group: 'Chat',
    method: 'POST',
    path: '/api/chat',
    summary: 'Send a chat message (non-streaming)',
    body: JSON.stringify(
      { messages: [{ role: 'user', content: 'Hello!' }] },
      null,
      2,
    ),
  },
  {
    group: 'Chat',
    method: 'POST',
    path: '/api/chat/stream',
    summary: 'Chat message (streaming NDJSON)',
    body: JSON.stringify(
      { messages: [{ role: 'user', content: 'Hello!' }] },
      null,
      2,
    ),
  },
  {
    group: 'Chat',
    method: 'POST',
    path: '/api/chat/compare',
    summary: 'Run the same prompt across multiple nodes and compare answers',
    body: JSON.stringify(
      {
        message: 'What is 2+2?',
        nodes: ['node-id-1', 'node-id-2'],
      },
      null,
      2,
    ),
  },
  {
    group: 'Chat',
    method: 'GET',
    path: '/api/chats',
    summary: 'List saved chat sessions',
  },
  {
    group: 'Chat',
    method: 'PUT',
    path: '/api/chats',
    summary: 'Save chat sessions (full replace)',
  },
  {
    group: 'Chat',
    method: 'GET',
    path: '/api/snippets',
    summary: 'List saved prompt snippets',
  },
  {
    group: 'Chat',
    method: 'POST',
    path: '/api/snippets',
    summary: 'Create a prompt snippet',
    body: JSON.stringify({ title: 'TL;DR', body: 'Summarise: ' }, null, 2),
  },
  {
    group: 'Chat',
    method: 'DELETE',
    path: '/api/snippets/{id}',
    summary: 'Delete a snippet',
    pathParams: ['id'],
  },
  {
    group: 'Chat',
    method: 'POST',
    path: '/api/fetch-url',
    summary: 'Fetch a URL server-side (used for chat URL ingestion)',
    body: JSON.stringify({ url: 'https://example.com' }, null, 2),
  },

  // ── Web search ─────────────────────────────────────────────────
  {
    group: 'Web search',
    method: 'POST',
    path: '/api/web/search',
    summary: 'Web search (DuckDuckGo HTML scrape)',
    body: JSON.stringify({ q: 'home automation', limit: 5 }, null, 2),
  },
  {
    group: 'Web search',
    method: 'POST',
    path: '/api/web/search-fetch',
    summary: 'Web search + fetch top N pages and return cleaned text',
    body: JSON.stringify({ q: 'home automation', limit: 3 }, null, 2),
  },

  // ── Tools ──────────────────────────────────────────────────────
  {
    group: 'Tools',
    method: 'GET',
    path: '/api/tools',
    summary: 'List available built-in tools',
  },
  {
    group: 'Tools',
    method: 'POST',
    path: '/api/tools/run/{name}',
    summary: 'Run a built-in tool by name',
    pathParams: ['name'],
    body: JSON.stringify({ args: {} }, null, 2),
  },

  // ── Schedules ──────────────────────────────────────────────────
  {
    group: 'Schedules',
    method: 'GET',
    path: '/api/schedules',
    summary: 'List recurring schedules',
  },
  {
    group: 'Schedules',
    method: 'POST',
    path: '/api/schedules',
    summary: 'Create or update a schedule',
    body: JSON.stringify(
      { name: 'morning brief', cron: '0 8 * * *', prompt: 'Summarise news.' },
      null,
      2,
    ),
  },
  {
    group: 'Schedules',
    method: 'DELETE',
    path: '/api/schedules/{id}',
    summary: 'Delete a schedule',
    pathParams: ['id'],
  },
  {
    group: 'Schedules',
    method: 'POST',
    path: '/api/schedules/{id}/run',
    summary: 'Trigger a schedule immediately',
    pathParams: ['id'],
  },

  // ── Settings ───────────────────────────────────────────────────
  {
    group: 'Settings',
    method: 'GET',
    path: '/api/settings',
    summary: 'Get runtime settings (default node temperature)',
  },
  {
    group: 'Settings',
    method: 'PUT',
    path: '/api/settings',
    summary: 'Update runtime settings',
    body: JSON.stringify({ defaultTemperature: 0.7 }, null, 2),
  },
  {
    group: 'Settings',
    method: 'POST',
    path: '/api/settings/reset',
    summary: 'Reset all runtime settings to defaults',
  },
];
