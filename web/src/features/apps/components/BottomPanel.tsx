import React from 'react';
import {
  AlertCircle,
  CheckSquare,
  Columns2,
  ListTree,
  Maximize2,
  Minimize2,
  Minus,
  RefreshCw,
  ScrollText,
  Terminal,
} from 'lucide-react';
import { EventLog } from '@/features/apps/components/BuildPanel';
import { appsApi } from '@/features/apps/api';
import type { BuildEvent } from '@/lib/types';

export type BottomTab = 'events' | 'todos' | 'logs' | 'terminal';
export type BottomState = 'minimized' | 'normal' | 'expanded';

/** One executed terminal command + its output, kept in scrollback history. */
export interface TermEntry {
  cmd: string;
  output: string;
  status: string;
}

function BottomPanelTabBar({
  active,
  onChange,
  events,
  selectedApp,
}: {
  active: BottomTab;
  onChange: (t: BottomTab) => void;
  events: BuildEvent[];
  selectedApp: string | null;
}) {
  const tabs: { id: BottomTab; label: string; icon: React.ReactNode }[] = [
    { id: 'events', label: 'Events', icon: <ListTree size={11} /> },
    { id: 'todos', label: 'Todos', icon: <CheckSquare size={11} /> },
    { id: 'logs', label: 'Container', icon: <ScrollText size={11} /> },
    { id: 'terminal', label: 'Terminal', icon: <Terminal size={11} /> },
  ];
  return (
    <div className="flex items-center gap-0">
      {tabs.map((t) => {
        const disabled =
          (t.id === 'logs' || t.id === 'terminal') && !selectedApp;
        return (
          <button
            key={t.id}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onChange(t.id);
            }}
            className={`flex items-center gap-1.5 px-2.5 h-7 text-xs uppercase tracking-wider transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              active === t.id
                ? 'text-foreground/80 border-b border-foreground/40 bg-white/[0.02]'
                : 'text-muted-foreground/65 hover:text-muted-foreground/70'
            }`}>
            {t.icon}
            <span>{t.label}</span>
            {t.id === 'events' && events.length > 0 && (
              <span className="text-xs tabular-nums text-muted-foreground/30">
                {events.length}
              </span>
            )}
            {t.id === 'events' && events.some((e) => e.step === 'error') && (
              <AlertCircle size={9} className="text-red-400" />
            )}
            {t.id === 'todos' &&
              (() => {
                const todos = extractTodos(events);
                if (todos.length === 0) return null;
                const done = todos.filter((x) => x.done).length;
                return (
                  <span className="text-xs tabular-nums text-muted-foreground/30">
                    {done}/{todos.length}
                  </span>
                );
              })()}
          </button>
        );
      })}
    </div>
  );
}

function TerminalView({
  selectedApp,
  appStatus,
  termCmd,
  setTermCmd,
  termHistory,
  setTermHistory,
  termRunning,
  termRef,
  runTermCmd,
}: {
  selectedApp: string | null;
  appStatus: string | undefined;
  termCmd: string;
  setTermCmd: (s: string) => void;
  termHistory: TermEntry[];
  setTermHistory: React.Dispatch<React.SetStateAction<TermEntry[]>>;
  termRunning: boolean;
  termRef: React.RefObject<HTMLDivElement | null>;
  runTermCmd: () => void;
}) {
  if (!selectedApp) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black">
        <p className="text-xs text-muted-foreground/30 font-mono">
          No app selected
        </p>
      </div>
    );
  }
  if (appStatus !== 'running') {
    return (
      <div className="flex-1 flex items-center justify-center bg-black">
        <div className="text-center space-y-1">
          <p className="text-xs text-muted-foreground/65 font-mono">
            Container is not running
          </p>
          <p className="text-xs text-muted-foreground/25 font-mono">
            Start the app to use the terminal
          </p>
        </div>
      </div>
    );
  }
  const prompt = `root@${selectedApp}:/app$ `;
  return (
    <div className="flex-1 flex flex-col bg-black overflow-hidden font-mono">
      <div ref={termRef} className="flex-1 overflow-auto px-3 pt-2">
        {termHistory.length === 0 && (
          <div className="text-xs text-emerald-500/40 leading-relaxed">
            <p>
              Connected to container{' '}
              <span className="text-emerald-400/70">{selectedApp}</span>
            </p>
            <p className="text-muted-foreground/65 text-xs mt-1">
              Try: ls, cat server.js, node -v, npm ls, ps aux
            </p>
            <p className="text-muted-foreground/65 text-xs">
              Type a command and press Enter.
            </p>
          </div>
        )}
        {termHistory.map((entry, i) => (
          <div key={i} className="text-xs leading-snug">
            <div>
              <span className="text-emerald-400/80">{prompt}</span>
              <span className="text-foreground/85">{entry.cmd}</span>
            </div>
            {entry.output && (
              <pre
                className={`whitespace-pre-wrap break-words ${
                  entry.status === 'error'
                    ? 'text-red-400/80'
                    : 'text-foreground/80'
                }`}>
                {entry.output}
              </pre>
            )}
          </div>
        ))}
        {termRunning && (
          <div className="text-xs text-emerald-400/50 leading-snug">
            <span className="animate-pulse">▊</span>
          </div>
        )}
      </div>
      <div className="flex items-center px-3 py-1.5 bg-black border-t border-emerald-500/10 shrink-0">
        <span className="text-xs text-emerald-400/80 font-mono whitespace-pre">
          {prompt}
        </span>
        <input
          autoFocus
          value={termCmd}
          onChange={(e) => setTermCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') runTermCmd();
            if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              setTermHistory([]);
            }
          }}
          disabled={termRunning}
          spellCheck={false}
          className="flex-1 bg-transparent text-xs font-mono text-foreground/85 border-0 outline-none caret-emerald-400 disabled:opacity-50"
        />
        {termHistory.length > 0 && (
          <button
            onClick={() => setTermHistory([])}
            title="Clear (Ctrl+L)"
            className="text-xs text-muted-foreground/30 hover:text-emerald-400/70 font-mono ml-2">
            clear
          </button>
        )}
      </div>
    </div>
  );
}

function ContainerLogsView({
  selectedApp,
  appLogs,
  appLogsLoading,
  appLogsRef,
  onRefresh,
}: {
  selectedApp: string | null;
  appLogs: string;
  appLogsLoading: boolean;
  appLogsRef: React.RefObject<HTMLPreElement | null>;
  onRefresh: () => void;
}) {
  if (!selectedApp) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black">
        <p className="text-xs text-muted-foreground/30 font-mono">
          No app selected
        </p>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col bg-black overflow-hidden">
      <div className="flex items-center justify-between px-3 h-6 border-b border-border/5 shrink-0 bg-black/40">
        <span className="text-xs uppercase tracking-wider text-muted-foreground/65 font-mono">
          docker logs -t {selectedApp}
        </span>
        <button
          onClick={onRefresh}
          disabled={appLogsLoading}
          className="text-xs text-muted-foreground/30 hover:text-foreground/60 transition-colors disabled:opacity-30">
          {appLogsLoading ? '...' : <RefreshCw size={10} />}
        </button>
      </div>
      <pre
        ref={appLogsRef}
        className="flex-1 overflow-auto px-3 py-2 text-xs font-mono text-muted-foreground/70 leading-relaxed whitespace-pre-wrap break-words">
        {appLogs || (appLogsLoading ? 'Loading...' : '(no logs)')}
      </pre>
    </div>
  );
}

function EventsView({
  events,
  logRef,
  selectedApp,
}: {
  events: BuildEvent[];
  logRef: React.RefObject<HTMLDivElement | null>;
  selectedApp: string | null;
}) {
  type RunMeta = {
    id: string;
    kind: string;
    started_at: string;
    success: boolean;
    events: BuildEvent[];
  };
  const [runs, setRuns] = React.useState<RunMeta[]>([]);
  const [selectedRun, setSelectedRun] = React.useState<string>('live');

  // Refresh history whenever the live event count changes (a new run just
  // finished) or the selected app changes.
  React.useEffect(() => {
    if (!selectedApp) {
      setRuns([]);
      return;
    }
    appsApi.getHistory(selectedApp).then((r) => {
      setRuns((r?.runs as RunMeta[]) || []);
    });
  }, [selectedApp, events.length]);

  const shown =
    selectedRun === 'live'
      ? events
      : runs.find((r) => r.id === selectedRun)?.events || [];

  return (
    <div
      ref={logRef}
      className="flex-1 overflow-auto px-2 py-1 min-h-0 bg-background">
      {selectedApp && runs.length > 0 && (
        <div className="flex items-center gap-2 mb-1 px-1 text-xs">
          <span className="text-muted-foreground/50 uppercase tracking-wider">
            Run
          </span>
          <select
            value={selectedRun}
            onChange={(e) => setSelectedRun(e.target.value)}
            className="bg-muted/20 border border-border/20 rounded px-1.5 py-0.5 text-xs text-foreground/80 font-mono">
            <option value="live">Live ({events.length})</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.success ? '✓' : '✗'} {r.kind} ·{' '}
                {fmtRelative(r.started_at)} ({r.events?.length || 0})
              </option>
            ))}
          </select>
        </div>
      )}
      {shown.length > 0 ? (
        <EventLog events={shown} expanded />
      ) : (
        <p className="text-xs text-muted-foreground/20 text-center pt-6 font-mono">
          No events yet
        </p>
      )}
    </div>
  );
}

function fmtRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return iso;
  const diff = Date.now() - t;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

/**
 * Distill the agent's most recent todo list out of the event stream.
 *
 * Opencode re-emits the WHOLE checklist every time a step flips, so every
 * event with `step: "todo"` and a leading ✓/○/· icon is a snapshot row.
 * We grab the most recent contiguous block of todo events (the latest
 * snapshot the agent printed) and dedupe by trimmed text — keeping the
 * `done` flag from whichever copy is checked.
 */
type TodoItem = { text: string; done: boolean };

function extractTodos(events: BuildEvent[]): TodoItem[] {
  const todos = events.filter((e) => e.step === 'todo');
  if (todos.length === 0) return [];

  // Walk backwards to grab the most recent contiguous run.
  let end = todos.length;
  let start = end;
  for (let i = end - 1; i >= 0; i--) {
    // A todo event is part of the current block if it's adjacent in the
    // overall events array to the next todo event we already accepted.
    // Simpler heuristic: take the LAST run separated by a non-todo event
    // in the original `events` array.
    const idx = events.indexOf(todos[i]);
    const nextIdx =
      i + 1 < end ? events.indexOf(todos[i + 1]) : Number.POSITIVE_INFINITY;
    if (i + 1 < end && nextIdx - idx > 4) break; // gap → previous snapshot
    start = i;
  }
  const latest = todos.slice(start, end);

  const seen = new Map<string, TodoItem>();
  for (const ev of latest) {
    const m = /^([✓○·])\s+(.+)$/.exec(ev.message);
    const text = (m ? m[2] : ev.message).trim();
    const done = m ? m[1] === '✓' : false;
    const prev = seen.get(text);
    seen.set(text, { text, done: done || (prev?.done ?? false) });
  }
  return Array.from(seen.values());
}

function TodosView({ events }: { events: BuildEvent[] }) {
  const todos = extractTodos(events);
  if (todos.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <p className="text-xs text-muted-foreground/30 font-mono">
          Waiting for the agent to plan tasks…
        </p>
      </div>
    );
  }
  const done = todos.filter((t) => t.done).length;
  const pct = Math.round((done / todos.length) * 100);
  return (
    <div className="flex-1 overflow-auto px-3 py-2 min-h-0 bg-background">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground/70">
        <span className="font-medium text-foreground/70">
          {done}/{todos.length} complete
        </span>
        <div className="flex-1 h-1 rounded-full bg-muted/30 overflow-hidden max-w-[180px]">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <ul className="space-y-1">
        {todos.map((t, i) => (
          <li
            key={i}
            className={`flex items-start gap-2 text-xs ${
              t.done ? 'text-muted-foreground/55' : 'text-foreground/90'
            }`}>
            <span
              className={`mt-[2px] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                t.done
                  ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                  : 'border-border/40 bg-muted/20 text-transparent'
              }`}>
              ✓
            </span>
            <span
              className={`leading-snug ${t.done ? 'line-through decoration-muted-foreground/30' : ''}`}>
              {t.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * IDE-style bottom panel hosting Events / Container logs / Terminal tabs.
 * Supports minimised / normal / expanded heights and an optional split view.
 */
export function BottomPanel(props: {
  state: BottomState;
  setState: (s: BottomState) => void;
  tab: BottomTab;
  setTab: (t: BottomTab) => void;
  split: boolean;
  setSplit: (b: boolean) => void;
  splitTab: BottomTab;
  setSplitTab: (t: BottomTab) => void;
  events: BuildEvent[];
  logRef: React.RefObject<HTMLDivElement | null>;
  selectedApp: string | null;
  appStatus: string | undefined;
  appLogs: string;
  appLogsLoading: boolean;
  appLogsRef: React.RefObject<HTMLPreElement | null>;
  onRefreshLogs: () => void;
  termCmd: string;
  setTermCmd: (s: string) => void;
  termHistory: TermEntry[];
  setTermHistory: React.Dispatch<React.SetStateAction<TermEntry[]>>;
  termRunning: boolean;
  termRef: React.RefObject<HTMLDivElement | null>;
  runTermCmd: () => void;
}) {
  const heightClass = {
    minimized: 'flex-none h-7',
    normal: 'flex-none h-[260px]',
    expanded: 'flex-1 min-h-0',
  }[props.state];

  const renderView = (which: BottomTab) => {
    if (which === 'events')
      return (
        <EventsView
          events={props.events}
          logRef={props.logRef}
          selectedApp={props.selectedApp}
        />
      );
    if (which === 'todos') return <TodosView events={props.events} />;
    if (which === 'logs')
      return (
        <ContainerLogsView
          selectedApp={props.selectedApp}
          appLogs={props.appLogs}
          appLogsLoading={props.appLogsLoading}
          appLogsRef={props.appLogsRef}
          onRefresh={props.onRefreshLogs}
        />
      );
    return (
      <TerminalView
        selectedApp={props.selectedApp}
        appStatus={props.appStatus}
        termCmd={props.termCmd}
        setTermCmd={props.setTermCmd}
        termHistory={props.termHistory}
        setTermHistory={props.setTermHistory}
        termRunning={props.termRunning}
        termRef={props.termRef}
        runTermCmd={props.runTermCmd}
      />
    );
  };

  return (
    <div
      className={`border-t border-border/10 flex flex-col transition-all overflow-hidden ${heightClass}`}>
      {/* Header bar with tabs + window controls */}
      <div className="flex items-center justify-between h-7 border-b border-border/5 shrink-0 bg-muted/10 select-none">
        <div className="flex items-center">
          <BottomPanelTabBar
            active={props.tab}
            onChange={(t) => {
              props.setTab(t);
              if (props.state === 'minimized') props.setState('normal');
            }}
            events={props.events}
            selectedApp={props.selectedApp}
          />
        </div>
        <div className="flex items-center gap-1 pr-2">
          {props.selectedApp && props.state !== 'minimized' && (
            <button
              onClick={() => props.setSplit(!props.split)}
              title={props.split ? 'Single view' : 'Split view'}
              className={`p-1 rounded transition-colors ${
                props.split
                  ? 'text-foreground/70 bg-white/[0.05]'
                  : 'text-muted-foreground/65 hover:text-foreground/70 hover:bg-white/[0.03]'
              }`}>
              <Columns2 size={11} />
            </button>
          )}
          <button
            onClick={() =>
              props.setState(
                props.state === 'minimized' ? 'normal' : 'minimized',
              )
            }
            title={props.state === 'minimized' ? 'Restore' : 'Minimize'}
            className="p-1 rounded text-muted-foreground/65 hover:text-foreground/70 hover:bg-white/[0.03] transition-colors">
            <Minus size={11} />
          </button>
          <button
            onClick={() =>
              props.setState(props.state === 'expanded' ? 'normal' : 'expanded')
            }
            title={props.state === 'expanded' ? 'Restore' : 'Maximize'}
            className="p-1 rounded text-muted-foreground/65 hover:text-foreground/70 hover:bg-white/[0.03] transition-colors">
            {props.state === 'expanded' ? (
              <Minimize2 size={11} />
            ) : (
              <Maximize2 size={11} />
            )}
          </button>
        </div>
      </div>

      {/* Body */}
      {props.state !== 'minimized' &&
        (props.split ? (
          <div className="flex-1 flex overflow-hidden min-h-0">
            <div className="flex-1 flex flex-col overflow-hidden border-r border-border/10">
              {renderView(props.tab)}
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center px-2 h-6 border-b border-border/5 shrink-0 bg-muted/10">
                <BottomPanelTabBar
                  active={props.splitTab}
                  onChange={props.setSplitTab}
                  events={props.events}
                  selectedApp={props.selectedApp}
                />
              </div>
              {renderView(props.splitTab)}
            </div>
          </div>
        ) : (
          renderView(props.tab)
        ))}
    </div>
  );
}
