import { useRef, useState } from 'react';
import { chatApi } from '@/features/chat/api';
import {
  readNdjson,
  stepLabel,
  type StreamEvent,
} from '@/features/chat/stream';
import {
  DEFAULT_SYSTEM_PROMPT,
  type ChatMsg,
  type ChatSession,
} from '@/features/chat/types';
import { errorMessage } from '@/lib/format';

const errorReply = (content: string): ChatMsg => ({
  id: `e-${Date.now()}`,
  role: 'assistant',
  content,
  error: true,
});

/**
 * Sends a message in `session` over the NDJSON stream. `thinking` is the
 * current step label while a reply is pending (null when idle); `stop`
 * aborts it without adding an error.
 */
export function useChatSend(
  session: ChatSession | null,
  update: (id: string, mut: (s: ChatSession) => ChatSession) => void,
) {
  const [thinking, setThinking] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = async (text: string) => {
    if (!session || abortRef.current) return;
    const { id } = session;
    const messages: ChatMsg[] = [
      ...session.messages,
      { id: `u-${Date.now()}`, role: 'user', content: text },
    ];
    const title =
      session.messages.length === 0
        ? text.slice(0, 60).replace(/\s+/g, ' ').trim() || 'New chat'
        : session.title;
    update(id, (s) => ({ ...s, title, messages, updatedAt: Date.now() }));
    const reply = (msg: ChatMsg) =>
      update(id, (s) => ({
        ...s,
        messages: [...messages, msg],
        updatedAt: Date.now(),
      }));

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setThinking('Thinking…');
    try {
      const route = session.modelOverride ?? 'auto';
      const res = await chatApi.streamChat(
        {
          messages: [
            { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
            ...messages
              .filter((m) => !m.error)
              .map(({ role, content }) => ({ role, content })),
          ],
          ...(route === 'auto' ? {} : { route }),
        },
        ctrl.signal,
      );
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      for await (const ev of readNdjson<StreamEvent>(res.body)) {
        const label = stepLabel(ev);
        if (label) setThinking(label);
        else if (ev.step === 'error')
          reply(errorReply(ev.message || 'Request failed'));
        else if (ev.step === 'done')
          reply({
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: ev.content || '',
            model: ev.model,
            node: ev.node,
            latency: ev.latency,
            promptTokens: ev.prompt_tokens,
            completionTokens: ev.completion_tokens,
            totalTokens: ev.total_tokens,
          });
      }
    } catch (e) {
      // Stop aborts the fetch; that is not worth an error bubble.
      if ((e as Error)?.name !== 'AbortError')
        reply(errorReply(errorMessage(e)));
    } finally {
      abortRef.current = null;
      setThinking(null);
    }
  };

  const stop = () => abortRef.current?.abort();

  return { send, stop, thinking, busy: thinking !== null };
}
