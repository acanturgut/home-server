import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { copyToClipboard } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Monospace snippet with an optional copy button. `className` styles the `<pre>` (e.g. `max-h-80`). */
export function CodeBlock({
  text,
  copy = true,
  className,
}: {
  text: string;
  copy?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (!(await copyToClipboard(text))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-start rounded-md bg-muted">
      <pre
        className={cn(
          'min-w-0 flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed text-foreground',
          className,
        )}
      >
        <code>{text}</code>
      </pre>
      {copy && (
        <IconButton
          icon={copied ? <Check /> : <Copy />}
          label={copied ? 'Copied' : 'Copy'}
          onClick={onCopy}
          className="m-1.5 shrink-0"
        />
      )}
    </div>
  );
}
