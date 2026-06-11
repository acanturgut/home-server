import {
  Database,
  KeyRound,
  Lightbulb,
  Bell,
  Activity,
  BarChart3,
  Upload,
  type LucideIcon,
} from 'lucide-react';

export interface Template {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Text appended to the build prompt when this template is selected. */
  promptAddon: string;
}

export const TEMPLATES: Template[] = [
  {
    id: 'database',
    label: 'Database',
    description: 'Persistent storage with SQLite (better-sqlite3).',
    icon: Database,
    promptAddon: `Persistence: include a SQLite database via better-sqlite3.
- Add "better-sqlite3" to package.json dependencies.
- Create db.js next to server.js that opens ./app.db, runs CREATE TABLE IF NOT EXISTS for the schema you need, and exports query helpers.
- Wire CRUD REST endpoints in server.js (GET/POST/PUT/DELETE) backed by the SQLite helpers.
- Make sure the schema and seed data are created on first boot so /health stays green.`,
  },
  {
    id: 'auth',
    label: 'Login / Register',
    description: 'Username + password auth with bcrypt and JWT.',
    icon: KeyRound,
    promptAddon: `Authentication: include a simple login + register flow.
- Add "bcryptjs" and "jsonwebtoken" to package.json dependencies.
- Server endpoints: POST api/register {username,password}, POST api/login {username,password} -> {token}, GET api/me (Bearer token).
- Store users with bcrypt-hashed passwords in users.json (or in the SQLite database if the database template is also enabled).
- Sign JWTs with a constant SECRET = process.env.JWT_SECRET || 'dev-secret-change-me', valid for 7 days.
- Frontend: add /login and /register screens (or modal). Persist token in localStorage as 'auth_token' and attach it as Authorization: Bearer <token> on protected fetches.
- Hide the main UI behind login when no token is present; provide a Logout button.`,
  },
  {
    id: 'home_automation',
    label: 'Home Automation',
    description: 'Control lights & devices via the home-server API.',
    icon: Lightbulb,
    promptAddon: `Home automation: integrate with the host home-server REST API to control real devices.
The scaffold's server.js auto-proxies /api/home/* (and /api/system, /api/nodes, /api/dashboard, /api/logs, /api/apps, /api/bridges, /api/homekit) back to the parent home-server. So from the BROWSER call them as plain RELATIVE URLs (no leading slash):

GET  api/home/devices                       -> list of devices [{id, name, kind, state, capabilities}]
POST api/home/devices/{id}/action            -> body { action: "on"|"off"|"toggle"|"brightness"|"color", value?: number|string }
POST api/home/refresh                        -> re-poll bridges
GET  api/home/bridges                        -> list of configured bridges (Hue / Dirigera / webOS / generic HTTP)

Build a UI that lists devices grouped by room/kind, lets the user toggle lights, set brightness via a slider, and refresh the list. Poll devices every 5 seconds. Show device kind icons (lightbulb, tv, plug). Handle errors gracefully when a bridge is offline. DO NOT remove the hostApiProxy middleware in server.js.`,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Toast notifications + browser push.',
    icon: Bell,
    promptAddon: `Notifications: include in-app toast notifications.
- Build a small Toast component (top-right, auto-dismiss after 4s, stack vertically).
- Provide a useToast() hook that exposes toast.success / toast.error / toast.info.
- Use it for all user-facing success and error feedback in the app (saves, deletes, network errors).`,
  },
  {
    id: 'realtime',
    label: 'Live updates',
    description: 'Server-sent events for live data without polling.',
    icon: Activity,
    promptAddon: `Realtime: push live updates from the server to the client.
- Add a GET /api/stream endpoint in server.js that uses Server-Sent Events (text/event-stream, keep-alive ping every 15s).
- The endpoint should emit JSON events whenever underlying state changes (CRUD operations, periodic ticks, etc.).
- In the React app, open an EventSource('api/stream') on mount, parse the JSON events, and update local state live. Reconnect on error with exponential backoff up to 30s.
- Show a subtle live indicator (green dot) in the header when the stream is connected.`,
  },
  {
    id: 'charts',
    label: 'Charts',
    description: 'Recharts line/bar/area visualisations.',
    icon: BarChart3,
    promptAddon: `Charts: include data visualisations.
- Add "recharts" to package.json dependencies.
- Build at least one ResponsiveContainer chart (line, area, or bar) that visualises the app's primary numeric data over time.
- Use the existing colour tokens (text-primary, --primary CSS var) for stroke/fill so the chart matches the theme.
- Include axis labels, a tooltip, and graceful empty-state copy when there is no data yet.`,
  },
  {
    id: 'uploads',
    label: 'File uploads',
    description: 'Multipart uploads stored on disk.',
    icon: Upload,
    promptAddon: `File uploads: let the user upload files.
- Add "multer" to package.json dependencies.
- POST api/upload (multipart/form-data, field name "file") saves the file under ./uploads/ with a sanitised, timestamped name and returns { id, url, size, mime }.
- GET api/uploads lists previously uploaded files; GET /uploads/:name serves them statically.
- Frontend: a drag-and-drop zone + file picker, an upload progress bar, and a thumbnail/list view of uploaded files with delete buttons.`,
  },
];

/** Build the final prompt that gets sent to the build endpoint. */
export function assembleFinalPrompt(args: {
  refinedPrompt: string;
  templates: string[];
  answers: Record<string, string>;
  questions: { id: string; question: string }[];
  notes: string;
  chunks?: { title: string; description: string; files?: string[] }[];
  architecture?: {
    stack?: string;
    models?: { name: string; fields: string }[];
    endpoints?: { method: string; path: string; purpose: string }[];
    components?: { name: string; purpose: string }[];
    notes?: string;
  };
}): string {
  const parts: string[] = [args.refinedPrompt.trim()];

  const picked = TEMPLATES.filter((t) => args.templates.includes(t.id));
  if (picked.length > 0) {
    parts.push('\n--- Required features (templates) ---');
    for (const t of picked) {
      parts.push(`\n[${t.label}]\n${t.promptAddon}`);
    }
  }

  const answeredQs = args.questions
    .map((q) => {
      const a = (args.answers[q.id] || '').trim();
      return a ? `- ${q.question} → ${a}` : '';
    })
    .filter(Boolean);
  if (answeredQs.length > 0) {
    parts.push('\n--- Clarifications ---');
    parts.push(answeredQs.join('\n'));
  }

  if (args.chunks && args.chunks.length > 0) {
    parts.push('\n--- Build plan (implement in this order) ---');
    args.chunks.forEach((c, i) => {
      const files =
        c.files && c.files.length > 0
          ? `\n  files: ${c.files.join(', ')}`
          : '';
      parts.push(
        `\n${i + 1}. ${c.title}\n   ${c.description.trim()}${files}`,
      );
    });
  }

  if (args.architecture) {
    const a = args.architecture;
    const hasAny =
      (a.stack && a.stack.trim()) ||
      (a.models && a.models.length) ||
      (a.endpoints && a.endpoints.length) ||
      (a.components && a.components.length) ||
      (a.notes && a.notes.trim());
    if (hasAny) {
      parts.push('\n--- Architecture ---');
      if (a.stack && a.stack.trim()) parts.push(`Stack: ${a.stack.trim()}`);
      if (a.models && a.models.length) {
        parts.push('Models:');
        for (const m of a.models)
          parts.push(`  - ${m.name}: ${m.fields}`);
      }
      if (a.endpoints && a.endpoints.length) {
        parts.push('Endpoints:');
        for (const e of a.endpoints)
          parts.push(`  - ${e.method} ${e.path} — ${e.purpose}`);
      }
      if (a.components && a.components.length) {
        parts.push('Components:');
        for (const c of a.components)
          parts.push(`  - ${c.name}: ${c.purpose}`);
      }
      if (a.notes && a.notes.trim()) parts.push(`Notes: ${a.notes.trim()}`);
    }
  }

  if (args.notes.trim()) {
    parts.push('\n--- Additional notes ---');
    parts.push(args.notes.trim());
  }
  return parts.join('\n');
}
