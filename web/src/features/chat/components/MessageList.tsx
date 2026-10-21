import { useEffect, useRef } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { ChatMarkdown } from '@/features/chat/components/ChatMarkdown';
import type { ChatMsg } from '@/features/chat/types';
import { cn } from '@/lib/utils';

/** Scrolling transcript; sticks to the bottom as messages and steps arrive. */
export function MessageList({
  messages,
  thinking,
}: {
  messages: ChatMsg[];
  thinking: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div className="mx-auto max-w-3xl space-y-4 px-3 py-4 sm:px-6">
        {messages.length === 0 ? (
          <EmptyState
            title="Ask anything, or control your home"
            description="Try “turn off the living room lights” or “is the bedroom warm enough?”"
            className="py-24"
          />
        ) : (
          messages.map((m) => <Bubble key={m.id} msg={m} />)
        )}
        {thinking && (
          <p
            role="status"
            className="flex items-center gap-2 px-1 text-xs text-muted-foreground"
          >
            <Spinner size={12} />
            {thinking}
          </p>
        )}
      </div>
    </div>
  );
}

function Bubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === 'user';
  const meta = [msg.model, msg.latency].filter(Boolean).join(' · ');
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-5/6 rounded-lg px-3.5 py-2 leading-relaxed wrap-break-word sm:max-w-3/4',
          isUser
            ? 'bg-primary whitespace-pre-wrap text-primary-foreground'
            : msg.error
              ? 'bg-destructive/10 text-destructive'
              : 'bg-card',
        )}
      >
        <span className="sr-only">{isUser ? 'You: ' : 'Assistant: '}</span>
        {isUser || msg.error ? (
          msg.content
        ) : (
          <ChatMarkdown text={msg.content} />
        )}
        {!isUser && meta && (
          <p className="mt-1.5 text-xs text-muted-foreground">{meta}</p>
        )}
      </div>
    </div>
  );
}
