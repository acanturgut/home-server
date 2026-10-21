import { useEffect, useRef, useState } from 'react';
import { PanelLeft } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { IconButton } from '@/components/ui/icon-button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Composer } from '@/features/chat/components/Composer';
import { MessageList } from '@/features/chat/components/MessageList';
import { SessionList } from '@/features/chat/components/SessionList';
import { useChatSend } from '@/features/chat/hooks/useChatSend';
import { useChatSessions } from '@/features/chat/hooks/useChatSessions';
import type { ChatRoute } from '@/features/chat/types';
import { pushRoute, useIsMobile, useRoute } from '@/lib/routing';

const ROUTES: { value: ChatRoute; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Fast' },
  { value: 'heavy', label: 'Smart' },
];

/**
 * Chat page: saved chats (rail on desktop, drawer on mobile), a model
 * picker, the transcript and the composer. Replies stream from
 * /api/chat/stream; /chat?prompt=… prefills the composer.
 */
export function ChatPanel() {
  const chat = useChatSessions();
  const { active } = chat;
  const { send, stop, thinking, busy } = useChatSend(active, chat.update);
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const prompt = useRoute().query.get('prompt');
  const [input, setInput] = useState(prompt ?? '');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Consume the prefill once: focus the composer and drop ?prompt so a
  // reload or Back doesn't refill it.
  useEffect(() => {
    if (!prompt) return;
    inputRef.current?.focus();
    pushRoute('chat', undefined, undefined, { replace: true });
  }, [prompt]);

  const submit = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    await send(text);
    // Refocusing on a phone would pop the keyboard back up.
    if (!isMobile) inputRef.current?.focus();
  };

  const sessionList = (
    <SessionList
      sessions={chat.sessions}
      activeId={active?.id}
      onSelect={(id) => {
        chat.select(id);
        setDrawerOpen(false);
      }}
      onNew={() => {
        chat.create();
        setDrawerOpen(false);
        inputRef.current?.focus();
      }}
      onDelete={chat.remove}
    />
  );

  return (
    <div className="flex h-full">
      {!isMobile && (
        <aside className="w-60 shrink-0 overflow-y-auto border-r p-2">
          {sessionList}
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2 sm:px-4">
          {isMobile && (
            <IconButton
              icon={<PanelLeft />}
              label="Open chats"
              onClick={() => setDrawerOpen(true)}
            />
          )}
          <h2 className="min-w-0 flex-1 truncate font-medium">
            {active?.title || 'Chat'}
          </h2>
          <SegmentedControl
            size="sm"
            aria-label="Model"
            options={ROUTES}
            value={active?.modelOverride ?? 'auto'}
            onValueChange={(route) =>
              active &&
              chat.update(active.id, (s) => ({ ...s, modelOverride: route }))
            }
          />
        </header>

        <MessageList
          messages={active?.messages ?? []}
          thinking={thinking}
          onSuggestion={(text) => {
            setInput(text);
            inputRef.current?.focus();
          }}
        />

        <Composer
          ref={inputRef}
          value={input}
          onChange={setInput}
          onSend={submit}
          onStop={stop}
          busy={busy}
        />
      </div>

      {isMobile && (
        <Drawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          side="left"
          title="Chats"
        >
          {sessionList}
        </Drawer>
      )}
    </div>
  );
}
