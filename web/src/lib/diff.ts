/** Unified-diff parser used by the AppsPanel diff viewer. */

export type DiffRow = {
  kind: 'ctx' | 'mod' | 'add' | 'del' | 'gap';
  oldNo?: number;
  newNo?: number;
  oldText?: string;
  newText?: string;
};

export type DiffFile = {
  path: string;
  oldPath: string;
  newPath: string;
  isNew: boolean;
  isDeleted: boolean;
  rows: DiffRow[];
  added: number;
  removed: number;
};

/** Parses a `git diff --unified` blob into per-file row models. */
export function parseUnifiedDiff(diff: string): DiffFile[] {
  if (!diff) return [];
  const files: DiffFile[] = [];
  const lines = diff.split('\n');
  let cur: DiffFile | null = null;
  let oldNo = 0;
  let newNo = 0;
  let pendingDel: { no: number; text: string }[] = [];
  let pendingAdd: { no: number; text: string }[] = [];

  const flushPending = () => {
    if (!cur) return;
    const n = Math.max(pendingDel.length, pendingAdd.length);
    for (let i = 0; i < n; i++) {
      const d = pendingDel[i];
      const a = pendingAdd[i];
      if (d && a) {
        cur.rows.push({
          kind: 'mod',
          oldNo: d.no,
          newNo: a.no,
          oldText: d.text,
          newText: a.text,
        });
      } else if (d) {
        cur.rows.push({ kind: 'del', oldNo: d.no, oldText: d.text });
      } else if (a) {
        cur.rows.push({ kind: 'add', newNo: a.no, newText: a.text });
      }
    }
    pendingDel = [];
    pendingAdd = [];
  };

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flushPending();
      const m = line.match(/diff --git a\/(.*?) b\/(.*)$/);
      const path = m ? m[2] : line.slice(11);
      cur = {
        path,
        oldPath: m ? m[1] : path,
        newPath: m ? m[2] : path,
        isNew: false,
        isDeleted: false,
        rows: [],
        added: 0,
        removed: 0,
      };
      files.push(cur);
      oldNo = 0;
      newNo = 0;
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('new file')) {
      cur.isNew = true;
      continue;
    }
    if (line.startsWith('deleted file')) {
      cur.isDeleted = true;
      continue;
    }
    if (line.startsWith('@@')) {
      flushPending();
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldNo = parseInt(m[1], 10);
        newNo = parseInt(m[2], 10);
      }
      if (cur.rows.length > 0) cur.rows.push({ kind: 'gap' });
      continue;
    }
    if (
      line.startsWith('---') ||
      line.startsWith('+++') ||
      line.startsWith('index ')
    )
      continue;
    if (line.startsWith('-')) {
      pendingDel.push({ no: oldNo++, text: line.slice(1) });
      cur.removed++;
      continue;
    }
    if (line.startsWith('+')) {
      pendingAdd.push({ no: newNo++, text: line.slice(1) });
      cur.added++;
      continue;
    }
    // context line (starts with space, or empty inside hunk)
    flushPending();
    const text = line.startsWith(' ') ? line.slice(1) : line;
    cur.rows.push({
      kind: 'ctx',
      oldNo: oldNo++,
      newNo: newNo++,
      oldText: text,
      newText: text,
    });
  }
  flushPending();
  return files;
}
