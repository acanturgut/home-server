import { useEffect, useRef } from 'react';
import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { ChatMarkdown } from '@/features/chat/components/ChatMarkdown';
import type { ChatMsg } from '@/features/chat/types';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  'Summarize today’s news',
  'Help me draft a quick email',
  'Explain this code I’ll paste',
  'Brainstorm 5 ideas for…',
];

/** Scrolling transcript; sticks to the bottom as messages and steps arrive. */
export function MessageList({
  messages,
  thinking,
  onSuggestion,
}: {
  messages: ChatMsg[];
  thinking: string | null;
  onSuggestion: (text: string) => void;
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
            icon={<Bot />}
            title="What can I help with?"
            description="Pick a model above or just start typing."
            action={
              <div className="grid max-w-md gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    className="h-auto justify-start py-2 text-left whitespace-normal"
                    onClick={() => onSuggestion(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            }
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
              ? 'border border-destructive/30 bg-destructive/10 text-destructive'
              : 'border bg-card',
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
