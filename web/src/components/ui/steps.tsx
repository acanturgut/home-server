import type { ReactNode } from 'react';

/** Numbered instructions (setup guides, pairing). */
export function Steps({
  items,
}: {
  items: { title?: ReactNode; body: ReactNode }[];
}) {
  return (
    <ol className="space-y-3">
      {items.map((s, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium text-muted-foreground tabular-nums"
          >
            {i + 1}
          </span>
          <div className="min-w-0 pt-0.5">
            {s.title && (
              <p className="font-medium text-foreground">{s.title}</p>
            )}
            <div className={s.title ? 'text-muted-foreground' : undefined}>
              {s.body}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
