import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import type { ChatSession } from '@/features/chat/types';
import { useConfirm } from '@/hooks/useConfirm';
import { cn } from '@/lib/utils';

/** "New chat" plus the saved chats. Shared by the desktop rail and the mobile drawer. */
export function SessionList({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  sessions: ChatSession[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const confirm = useConfirm();
  const remove = async (s: ChatSession) => {
    const ok = await confirm({
      title: `Delete “${s.title || 'Untitled'}”?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) onDelete(s.id);
  };

  return (
    <div className="space-y-2">
      <Button variant="secondary" className="w-full" onClick={onNew}>
        <Plus />
        New chat
      </Button>
      <ul className="space-y-0.5">
        {sessions.map((s) => {
          const active = s.id === activeId;
          return (
            <li key={s.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                aria-current={active || undefined}
                className={cn(
                  'w-full truncate rounded-md py-2 pr-9 pl-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  active
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                {s.title || 'Untitled'}
              </button>
              {/* Hover-revealed on desktop; always shown on touch and while focused. */}
              <IconButton
                icon={<Trash2 />}
                label={`Delete ${s.title || 'chat'}`}
                onClick={() => remove(s)}
                className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
