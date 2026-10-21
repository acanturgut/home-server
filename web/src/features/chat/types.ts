/**
 * Chat domain types shared by ChatPanel and its API layer. Sessions saved by
 * the legacy panel may carry extra fields; they round-trip untouched.
 */

export interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
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
  modelOverride?: string; // 'auto' | 'light' | 'heavy'
}

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
