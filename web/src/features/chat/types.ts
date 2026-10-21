/** Chat domain types. Sessions round-trip through PUT /api/chats untouched. */

/** Which model tier answers: let the router pick, or force fast / smart. */
export type ChatRoute = 'auto' | 'light' | 'heavy';

export interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** Set on a failed reply; such messages are not sent back to the model. */
  error?: boolean;
  node?: string;
  model?: string;
  latency?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMsg[];
  updatedAt: number;
  createdAt?: number;
  modelOverride?: ChatRoute;
}

// System prompt sent with every chat. The server may attach fresh web search
// results to the user message; the prompt tells the model to trust and cite
// them, and asks for short "---"-separated sections.
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
  'Without web results, be honest about knowledge cutoffs.',
  '',
  'Formatting: structure longer answers as several short sections separated by a',
  'line containing only "---" so the UI can render them as distinct message bubbles.',
  'Aim for 1–4 sections. Keep each section focused on one idea. Use markdown.',
].join('\n');
