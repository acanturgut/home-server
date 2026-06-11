import { useState, useEffect, useRef, useMemo } from 'react';
import { FileCode2 } from 'lucide-react';
import { parseUnifiedDiff, type DiffFile } from '@/lib/diff';

/** Renders a single file's hunks in either split or unified mode. */
function FileBlock({ f, mode }: { f: DiffFile; mode: 'split' | 'unified' }) {
  return (
    <div className="rounded border border-white/10">
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-[#0a0a0a] border-b border-white/10 text-xs rounded-t">
        <FileCode2 size={11} className="text-violet-400/70 shrink-0" />
        <span className="font-mono text-foreground/80 truncate flex-1">
          {f.path}
        </span>
        {f.isNew && (
          <span className="text-xs uppercase text-emerald-400/80">new</span>
        )}
        {f.isDeleted && (
          <span className="text-xs uppercase text-red-400/80">deleted</span>
        )}
        <span className="text-xs tabular-nums text-emerald-400/80">
          +{f.added}
        </span>
        <span className="text-xs tabular-nums text-red-400/80">
          −{f.removed}
        </span>
      </div>
      {mode === 'split' ? (
        <div className="grid grid-cols-2 text-xs font-mono">
          {f.rows.map((row, ri) => {
            if (row.kind === 'gap') {
              return (
                <div
                  key={ri}
                  className="col-span-2 px-3 py-1 bg-sky-500/5 text-sky-400/60 border-y border-white/5 text-xs">
                  ⋯
                </div>
              );
            }
            const leftFill = row.kind === 'add';
            const rightFill = row.kind === 'del';
            const leftBg =
              row.kind === 'del'
                ? 'bg-red-500/10'
                : row.kind === 'mod'
                  ? 'bg-red-500/8'
                  : leftFill
                    ? 'bg-white/[0.015]'
                    : '';
            const rightBg =
              row.kind === 'add'
                ? 'bg-emerald-500/10'
                : row.kind === 'mod'
                  ? 'bg-emerald-500/8'
                  : rightFill
                    ? 'bg-white/[0.015]'
                    : '';
            return (
              <div key={ri} className="contents">
                <div className={`flex border-r border-white/5 ${leftBg}`}>
                  <span className="w-9 shrink-0 text-right pr-2 text-muted-foreground/30 tabular-nums select-none">
                    {row.oldNo ?? ''}
                  </span>
                  <span className="flex-1 whitespace-pre-wrap break-all px-1 text-foreground/80">
                    {leftFill ? '' : (row.oldText ?? '')}
                  </span>
                </div>
                <div className={`flex ${rightBg}`}>
                  <span className="w-9 shrink-0 text-right pr-2 text-muted-foreground/30 tabular-nums select-none">
                    {row.newNo ?? ''}
                  </span>
                  <span className="flex-1 whitespace-pre-wrap break-all px-1 text-foreground/80">
                    {rightFill ? '' : (row.newText ?? '')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-xs font-mono">
          {f.rows.map((row, ri) => {
            if (row.kind === 'gap') {
              return (
                <div
                  key={ri}
                  className="px-3 py-1 bg-sky-500/5 text-sky-400/60 text-xs">
                  ⋯
                </div>
              );
            }
            if (row.kind === 'mod') {
              return (
                <div key={ri}>
                  <div className="flex bg-red-500/10">
                    <span className="w-9 shrink-0 text-right pr-2 text-muted-foreground/30 select-none">
                      {row.oldNo}
                    </span>
                    <span className="px-1 text-red-300/90">−</span>
                    <span className="flex-1 whitespace-pre-wrap break-all">
                      {row.oldText}
                    </span>
                  </div>
                  <div className="flex bg-emerald-500/10">
                    <span className="w-9 shrink-0 text-right pr-2 text-muted-foreground/30 select-none">
                      {row.newNo}
                    </span>
                    <span className="px-1 text-emerald-300/90">+</span>
                    <span className="flex-1 whitespace-pre-wrap break-all">
                      {row.newText}
                    </span>
                  </div>
                </div>
              );
            }
            const bg =
              row.kind === 'add'
                ? 'bg-emerald-500/10'
                : row.kind === 'del'
                  ? 'bg-red-500/10'
                  : '';
            const sign =
              row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ' ';
            const text =
              row.kind === 'add'
                ? row.newText
                : row.kind === 'del'
                  ? row.oldText
                  : row.oldText;
            const no = row.kind === 'add' ? row.newNo : row.oldNo;
            return (
              <div key={ri} className={`flex ${bg}`}>
                <span className="w-9 shrink-0 text-right pr-2 text-muted-foreground/30 select-none">
                  {no ?? ''}
                </span>
                <span className="px-1 text-muted-foreground/65">{sign}</span>
                <span className="flex-1 whitespace-pre-wrap break-all text-foreground/80">
                  {text ?? ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * File-list sidebar + per-file diff viewer. `layout='all'` shows every file
 * stacked (clicking the sidebar scrolls to it); `layout='single'` shows only
 * the currently selected file.
 */
export function DiffView({
  diff,
  mode,
  layout,
}: {
  diff: string;
  mode: 'split' | 'unified';
  layout: 'all' | 'single';
}) {
  const files = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const [selected, setSelected] = useState(0);
  const fileRefs = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    setSelected(0);
  }, [diff]);
  if (!files.length) {
    return (
      <div className="p-4 text-xs text-muted-foreground/60">
        No changes.
      </div>
    );
  }
  const onPick = (fi: number) => {
    setSelected(fi);
    if (layout === 'all') {
      fileRefs.current[fi]?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  };
  return (
    <div className="flex gap-3 h-full min-h-0">
      <div className="w-56 shrink-0 h-full overflow-y-auto overflow-x-hidden border-r border-white/10 pr-2 -mr-1">
        <div className="sticky top-0 bg-[#0a0a0a] z-10 text-xs uppercase tracking-wider text-muted-foreground/65 px-2 py-1">
          {files.length} file{files.length === 1 ? '' : 's'} changed
        </div>
        {files.map((f, fi) => (
          <button
            key={fi}
            onClick={() => onPick(fi)}
            title={f.path}
            className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-left text-xs mb-0.5 ${
              fi === selected
                ? 'bg-violet-500/15 text-foreground'
                : 'text-muted-foreground/70 hover:bg-white/5'
            }`}>
            <FileCode2 size={10} className="shrink-0 opacity-60" />
            <span className="truncate flex-1 font-mono">
              {f.path.split('/').pop()}
            </span>
            <span className="text-xs tabular-nums text-emerald-400/70">
              +{f.added}
            </span>
            <span className="text-xs tabular-nums text-red-400/70">
              −{f.removed}
            </span>
          </button>
        ))}
      </div>
      <div className="flex-1 h-full overflow-y-auto overflow-x-hidden min-w-0">
        {layout === 'all' ? (
          <div className="space-y-4">
            {files.map((f, fi) => (
              <div
                key={fi}
                ref={(el) => {
                  fileRefs.current[fi] = el;
                }}>
                <FileBlock f={f} mode={mode} />
              </div>
            ))}
          </div>
        ) : (
          <FileBlock
            f={files[Math.min(selected, files.length - 1)]}
            mode={mode}
          />
        )}
      </div>
    </div>
  );
}
