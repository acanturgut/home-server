import type { KeyboardEvent, Ref } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useIsMobile } from '@/lib/routing';

/**
 * Message box pinned to the bottom (safe-area aware). Enter sends and
 * Shift+Enter adds a line on desktop; on phones Enter is a newline and the
 * button sends. While a reply streams the button becomes Stop.
 */
export function Composer({
  ref,
  value,
  onChange,
  onSend,
  onStop,
  busy,
}: {
  ref?: Ref<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
}) {
  const isMobile = useIsMobile();
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || isMobile) return;
    if (e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (!busy) onSend();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      className="shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-3xl items-end gap-2 px-3 py-2 sm:px-6">
        <Textarea
          ref={ref}
          aria-label="Message"
          placeholder="Message…"
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="field-sizing-content max-h-40 min-h-10 resize-none"
        />
        {busy ? (
          <Button
            variant="destructive"
            size="icon-lg"
            aria-label="Stop"
            title="Stop"
            onClick={onStop}
          >
            <Square fill="currentColor" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon-lg"
            aria-label="Send"
            title="Send"
            disabled={!value.trim()}
          >
            <ArrowUp />
          </Button>
        )}
      </div>
    </form>
  );
}
