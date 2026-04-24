import type { Endpoint } from './types';

/** Static catalogue of API endpoints rendered by the API explorer panel. */
export const ENDPOINTS: Endpoint[] = [
  {
    method: 'GET',
    path: '/api/health',
    summary: 'System health, Ollama status & node online/offline',
  },
  {
    method: 'GET',
    path: '/api/config',
    summary: 'Current server configuration (router model, ollama host)',
  },
  {
    method: 'PUT',
    path: '/api/config',
    summary: 'Update server config (e.g. router model)',
    body: JSON.stringify({ router_model: 'gemma3:1b' }, null, 2),
  },
  {
    method: 'GET',
    path: '/api/logs',
    summary: 'Recent server logs',
    queryParams: [{ name: 'n', default: '50' }],
  },
  { method: 'GET', path: '/api/nodes', summary: 'List all compute nodes' },
  {
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
    method: 'DELETE',
    path: '/api/nodes/{id}',
    summary: 'Delete a compute node',
    pathParams: ['id'],
  },
  {
    method: 'POST',
    path: '/api/nodes/{id}/wake',
    summary: 'Send Wake-on-LAN magic packet',
    pathParams: ['id'],
  },
  {
    method: 'GET',
    path: '/api/nodes/{id}/models',
    summary: 'List models on a node (LM Studio)',
    pathParams: ['id'],
  },
  {
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
    method: 'POST',
    path: '/api/chat/stream',
    summary: 'Chat message (streaming NDJSON)',
    body: JSON.stringify(
      { messages: [{ role: 'user', content: 'Hello!' }] },
      null,
      2,
    ),
  },
];
