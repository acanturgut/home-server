import { useEffect, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileJson,
  FileType,
  File,
  Hash,
  Code2,
} from 'lucide-react';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language';
import { ghDarkTheme, ghDarkHighlight } from '@/lib/cm-theme';
import { getLang } from '@/lib/cm-lang';

export interface AppFile {
  path: string;
  size: number;
}

/** Hierarchical view of an app's source tree, built by `buildTree`. */
export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

/** Builds a sorted (dirs-first, then alphabetical) tree from a flat file list. */
export function buildTree(files: AppFile[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isDir: true, children: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const name = parts[i];
      const fullPath = parts.slice(0, i + 1).join('/');
      let child = node.children.find((c) => c.name === name);
      if (!child) {
        child = { name, path: fullPath, isDir: !isLast, children: [] };
        node.children.push(child);
      }
      node = child;
    }
  }
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(root.children);
  return root.children;
}

/** Recursive file-tree row with extension-coloured icons. */
export function FileTreeNode({
  node,
  depth,
  selectedFile,
  onSelect,
  expanded,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  selectedFile: string | null;
  onSelect: (path: string) => void;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}) {
  const isOpen = expanded.has(node.path);
  const isActive = selectedFile === node.path;
  const ext = node.name.split('.').pop() || '';
  const fileIcon = node.isDir ? (
    isOpen ? (
      <ChevronDown size={10} />
    ) : (
      <ChevronRight size={10} />
    )
  ) : ext === 'jsx' || ext === 'tsx' ? (
    <FileCode2 size={10} />
  ) : ext === 'js' || ext === 'ts' ? (
    <FileCode2 size={10} />
  ) : ext === 'json' ? (
    <FileJson size={10} />
  ) : ext === 'css' ? (
    <Hash size={10} />
  ) : ext === 'html' ? (
    <Code2 size={10} />
  ) : ext === 'md' ? (
    <FileType size={10} />
  ) : (
    <File size={10} />
  );
  const iconColor = node.isDir
    ? 'text-blue-400/60'
    : ext === 'jsx' || ext === 'tsx'
      ? 'text-cyan-400/70'
      : ext === 'js' || ext === 'ts'
        ? 'text-yellow-400/70'
        : ext === 'json'
          ? 'text-amber-400/50'
          : ext === 'css'
            ? 'text-purple-400/70'
            : 'text-muted-foreground/65';

  return (
    <>
      <button
        onClick={() => (node.isDir ? onToggle(node.path) : onSelect(node.path))}
        className={`w-full flex items-center gap-1 py-[3px] text-xs font-mono transition-colors hover:bg-white/[0.03] ${
          isActive ? 'bg-blue-500/8 text-blue-300' : 'text-muted-foreground/70'
        }`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        title={node.path}>
        <span className={`shrink-0 w-4 text-center text-xs ${iconColor}`}>
          {fileIcon}
        </span>
        <span
          className={`truncate ${node.isDir ? 'text-muted-foreground/60' : ''}`}>
          {node.name}
        </span>
      </button>
      {node.isDir &&
        isOpen &&
        node.children.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedFile={selectedFile}
            onSelect={onSelect}
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

/** CodeMirror-based editor with GitHub-dark theme + Cmd-S save shortcut. */
export function CodeEditor({
  value,
  onChange,
  ext,
  onSave,
}: {
  value: string;
  onChange: (v: string) => void;
  ext: string;
  onSave?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const isSyncingRef = useRef(false);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  // Create editor once
  useEffect(() => {
    if (!containerRef.current) return;
    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          onSaveRef.current?.();
          return true;
        },
      },
    ]);
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          bracketMatching(),
          indentOnInput(),
          highlightSelectionMatches(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          keymap.of([...defaultKeymap, ...searchKeymap, indentWithTab]),
          saveKeymap,
          getLang(ext),
          ghDarkTheme,
          syntaxHighlighting(ghDarkHighlight),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !isSyncingRef.current) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '12px' },
            '.cm-scroller': {
              overflow: 'auto',
              fontFamily: '"SF Mono", "Fira Code", Menlo, Consolas, monospace',
            },
            '.cm-content': { padding: '8px 0' },
          }),
        ],
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ext]); // recreate when language changes

  // Sync external value changes (e.g. file switch)
  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      isSyncingRef.current = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
      isSyncingRef.current = false;
    }
  }, [value]);

  return <div ref={containerRef} className="w-full h-full" />;
}
