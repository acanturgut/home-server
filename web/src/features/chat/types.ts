/** Chat domain types shared across ChatPanel and its companion modals. */

export interface ChatAttachment {
  id: string;
  name: string;
  type: string; // mime
  size: number;
  text?: string; // for text-like content
  dataUrl?: string; // for images
}

export interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  node?: string;
  tier?: string;
  model?: string;
  route?: string;
  latency?: string;
  classifierLatency?: string;
  stepType?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  edited?: boolean;
  attachments?: ChatAttachment[];
  reasoningSteps?: Array<{ kind: string; text: string }>;
  // For branching / regenerate
  parentSessionId?: string;
  branchFromMsgId?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMsg[];
  updatedAt: number;
  createdAt?: number;
  pinned?: boolean;
  starred?: boolean;
  archived?: boolean;
  system?: string; // persona / system prompt
  modelOverride?: string; // 'auto' | 'light' | 'heavy' | nodeName
  temperature?: number;
  totalPromptTokens?: number;
  totalCompletionTokens?: number;
  parentSessionId?: string;
  branchFromMsgId?: string;
}

export interface Persona {
  id: string;
  name: string;
  emoji?: string;
  system: string;
}

export const BUILTIN_PERSONAS: Persona[] = [
  { id: 'default', name: 'Default', emoji: '💬', system: '' },
  {
    id: 'engineer',
    name: 'Senior Engineer',
    emoji: '🔧',
    system:
      'You are a senior software engineer. Be concise, pragmatic, and code-first. Prefer trade-off analysis over verbose explanation.',
  },
  {
    id: 'tutor',
    name: 'Patient Tutor',
    emoji: '🎓',
    system:
      "You are a patient tutor. Explain step-by-step with small examples. Ask one clarifying question if the user's goal is ambiguous.",
  },
  {
    id: 'editor',
    name: 'Sharp Editor',
    emoji: '✍️',
    system:
      'You are a sharp editor. Tighten prose, kill filler, preserve voice. Show before/after when helpful.',
  },
  {
    id: 'shell',
    name: 'Shell Wizard',
    emoji: '🖥️',
    system:
      'You are a shell expert. Reply with a single fenced bash block plus one sentence of context unless asked otherwise.',
  },
];

// Default system prompt applied to every chat unless the user replaces it.
// The key goals: (1) stop the model from claiming it can't search when the
// user has explicitly enabled web search and supplied fresh page content;
// (2) encourage answers split into clearly separated sections so the UI can
// render them as multiple message bubbles.
export const DEFAULT_SYSTEM_PROMPT = [
  'You are a helpful assistant running on a private home server.',
  '',
  'If the user message includes an attachment labelled "Web search results for: …",',
  'those are fresh search results that were just fetched for the user. Use them as',
  'authoritative, up-to-date source material. Quote concrete facts from them. Cite',
  'which result you used by domain in parentheses, e.g. "(weather.com)". Never say',
  'you cannot search the web when such results are present — the search has already',
  'been performed for you.',
  '',
  'Without web results, be honest about knowledge cutoffs and suggest the user',
  'enable the Web toggle for live data.',
  '',
  'Formatting: structure longer answers as several short sections separated by a',
  'line containing only "---" so the UI can render them as distinct message bubbles.',
  'Aim for 1–4 sections. Keep each section focused on one idea. Use markdown.',
].join('\n');
