import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  kind?: 'step'; // "step" for server pipeline bubbles
  stepType?: 'classifying' | 'classified' | 'generating' | 'done' | 'error';
  route?: string;
  node?: string;
  tier?: string;
  model?: string;
  reason?: string;
  classifierOutput?: string;
  classifierLatency?: string;
  latency?: string;
}

export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const SESSIONS_KEY = 'chat_sessions';
const ACTIVE_KEY = 'active_session';

export async function loadSessions(): Promise<Session[]> {
  const raw = await AsyncStorage.getItem(SESSIONS_KEY);
  if (!raw) return [];
  return JSON.parse(raw);
}

export async function saveSessions(sessions: Session[]): Promise<void> {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export async function getActiveSessionId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_KEY);
}

export async function setActiveSessionId(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_KEY, id);
}

export function createSession(): Session {
  return {
    id: Date.now().toString(),
    title: 'New Chat',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function sessionTitle(session: Session): string {
  const firstUser = session.messages.find((m) => m.role === 'user');
  if (firstUser) {
    const text = firstUser.content.slice(0, 40);
    return text.length < firstUser.content.length ? text + '…' : text;
  }
  return 'New Chat';
}
