const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.50.199:8080';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  model: string;
  message: Message;
  node: string;
  tier: string;
  route: string;
  reason: string;
  classifier_output: string;
  classifier_latency: string;
  latency: string;
}

export interface Node {
  id: string;
  name: string;
  host: string;
  tier: 'high-end' | 'low-end';
  gpu?: string;
  mac?: string;
  model?: string;
}

export interface NodeStatus {
  id: string;
  name: string;
  host: string;
  tier: string;
  gpu?: string;
  mac?: string;
  model?: string;
  online: boolean;
}

export interface HealthResponse {
  status: string;
  backends: {
    ollama: boolean;
    nodes: NodeStatus[];
  };
}

export interface LogEntry {
  timestamp: string;
  level: string;
  request_id?: string;
  route?: string;
  model?: string;
  node?: string;
  tier?: string;
  latency?: string;
  message: string;
}

export async function sendChat(messages: Message[]): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/api/health`);
  return res.json();
}

export async function getLogs(n = 50): Promise<LogEntry[]> {
  const res = await fetch(`${API_URL}/api/logs?n=${n}`);
  return res.json();
}

export async function getNodes(): Promise<Node[]> {
  const res = await fetch(`${API_URL}/api/nodes`);
  return res.json();
}

export async function addNode(node: Omit<Node, 'id'>): Promise<Node> {
  const res = await fetch(`${API_URL}/api/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(node),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to add node');
  }
  return res.json();
}

export async function updateNode(
  id: string,
  node: Partial<Node>,
): Promise<Node> {
  const res = await fetch(`${API_URL}/api/nodes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(node),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update node');
  }
  return res.json();
}

export async function deleteNode(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/nodes/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to delete node');
  }
}

export async function wakeNode(
  id: string,
): Promise<{ status: string; node: string; mac: string }> {
  const res = await fetch(`${API_URL}/api/nodes/${id}/wake`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to wake node');
  }
  return res.json();
}

export async function listNodeModels(id: string): Promise<string[]> {
  const res = await fetch(`${API_URL}/api/nodes/${id}/models`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to list models');
  }
  const data = await res.json();
  return data.models || [];
}

export async function getConfig(): Promise<{
  router_model: string;
  ollama_host: string;
}> {
  const res = await fetch(`${API_URL}/api/config`);
  return res.json();
}

export async function updateConfig(config: {
  router_model?: string;
}): Promise<{ router_model: string }> {
  const res = await fetch(`${API_URL}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return res.json();
}

// Streaming chat

export interface StreamEvent {
  step: 'classifying' | 'classified' | 'generating' | 'done' | 'error';
  message?: string;
  content?: string;
  model?: string;
  node?: string;
  tier?: string;
  route?: string;
  reason?: string;
  classifier_output?: string;
  classifier_latency?: string;
  latency?: string;
}

export function sendChatStream(
  messages: Message[],
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/chat/stream`);
    xhr.setRequestHeader('Content-Type', 'application/json');

    let processed = 0;

    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 3 && xhr.responseText) {
        const text = xhr.responseText.substring(processed);
        processed = xhr.responseText.length;

        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            onEvent(JSON.parse(trimmed) as StreamEvent);
          } catch {}
        }
      }

      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error('Stream request failed'));
        }
      }
    };

    xhr.send(JSON.stringify({ messages }));
  });
}

// Distributed tasks

export interface DistributedStep {
  step: string;
  node: string;
  tier: string;
  task?: string;
  content: string;
  latency: string;
}

export interface DistributedResponse {
  steps: DistributedStep[];
  final_result: string;
  total_latency: string;
}

export async function runDistributed(
  task: string,
): Promise<DistributedResponse> {
  const res = await fetch(`${API_URL}/api/distributed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Distributed task failed');
  }
  return res.json();
}

// ── Apps Pipeline ──────────────────────────────────

export interface AppInfo {
  name: string;
  port: number;
  healthcheck: string;
  route: string;
  type: string;
  status: 'building' | 'running' | 'stopped' | 'failed';
  prompt: string;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface BuildEvent {
  step: string;
  message: string;
  detail?: string;
  latency?: string;
}

export async function listApps(): Promise<AppInfo[]> {
  const res = await fetch(`${API_URL}/api/apps`);
  return res.json();
}

export function buildApp(
  prompt: string,
  onEvent: (event: BuildEvent) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/apps/build`);
    xhr.setRequestHeader('Content-Type', 'application/json');

    let processed = 0;

    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 3 && xhr.responseText) {
        const text = xhr.responseText.substring(processed);
        processed = xhr.responseText.length;
        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            onEvent(JSON.parse(trimmed) as BuildEvent);
          } catch {}
        }
      }
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else {
          let msg = `Build failed (${xhr.status})`;
          try {
            const body = JSON.parse(xhr.responseText);
            if (body.error) msg = body.error;
          } catch {}
          reject(new Error(msg));
        }
      }
    };

    xhr.send(JSON.stringify({ prompt }));
  });
}

export function rebuildApp(
  name: string,
  changes: string,
  onEvent: (event: BuildEvent) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/apps/${name}/rebuild`);
    xhr.setRequestHeader('Content-Type', 'application/json');

    let processed = 0;

    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 3 && xhr.responseText) {
        const text = xhr.responseText.substring(processed);
        processed = xhr.responseText.length;
        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            onEvent(JSON.parse(trimmed) as BuildEvent);
          } catch {}
        }
      }
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else {
          let msg = `Rebuild failed (${xhr.status})`;
          try {
            const body = JSON.parse(xhr.responseText);
            if (body.error) msg = body.error;
          } catch {}
          reject(new Error(msg));
        }
      }
    };

    xhr.send(JSON.stringify({ changes }));
  });
}

export async function deleteApp(name: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/apps/${name}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to delete app');
  }
}

export async function stopApp(name: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/apps/${name}/stop`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to stop app');
  }
}
