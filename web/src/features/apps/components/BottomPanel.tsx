import React from 'react';
import {
  AlertCircle,
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
import type { BuildEvent } from '@/lib/types';

export type BottomTab = 'events' | 'logs' | 'terminal';
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
            className={`flex items-center gap-1.5 px-2.5 h-7 text-[10px] uppercase tracking-wider transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              active === t.id
                ? 'text-foreground/80 border-b border-foreground/40 bg-white/[0.02]'
                : 'text-muted-foreground/40 hover:text-muted-foreground/70'
            }`}>
            {t.icon}
            <span>{t.label}</span>
            {t.id === 'events' && events.length > 0 && (
              <span className="text-[9px] tabular-nums text-muted-foreground/30">
                {events.length}
              </span>
            )}
            {t.id === 'events' && events.some((e) => e.step === 'error') && (
              <AlertCircle size={9} className="text-red-400" />
            )}
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
        <p className="text-[11px] text-muted-foreground/30 font-mono">
          No app selected
        </p>
      </div>
    );
  }
  if (appStatus !== 'running') {
    return (
      <div className="flex-1 flex items-center justify-center bg-black">
        <div className="text-center space-y-1">
          <p className="text-[11px] text-muted-foreground/40 font-mono">
            Container is not running
          </p>
          <p className="text-[10px] text-muted-foreground/25 font-mono">
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
          <div className="text-[11px] text-emerald-500/40 leading-relaxed">
            <p>
              Connected to container{' '}
              <span className="text-emerald-400/70">{selectedApp}</span>
            </p>
            <p className="text-muted-foreground/40 text-[10px] mt-1">
              Try: ls, cat server.js, node -v, npm ls, ps aux
            </p>
            <p className="text-muted-foreground/40 text-[10px]">
              Type a command and press Enter.
            </p>
          </div>
        )}
        {termHistory.map((entry, i) => (
          <div key={i} className="text-[11px] leading-snug">
            <div>
              <span className="text-emerald-400/80">{prompt}</span>
              <span className="text-foreground/85">{entry.cmd}</span>
            </div>
            {entry.output && (
              <pre
                className={`whitespace-pre-wrap break-words ${
                  entry.status === 'error'
                    ? 'text-red-400/80'
                    : 'text-foreground/65'
                }`}>
                {entry.output}
              </pre>
            )}
          </div>
        ))}
        {termRunning && (
          <div className="text-[11px] text-emerald-400/50 leading-snug">
            <span className="animate-pulse">▊</span>
          </div>
        )}
      </div>
      <div className="flex items-center px-3 py-1.5 bg-black border-t border-emerald-500/10 shrink-0">
        <span className="text-[11px] text-emerald-400/80 font-mono whitespace-pre">
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
          className="flex-1 bg-transparent text-[11px] font-mono text-foreground/85 border-0 outline-none caret-emerald-400 disabled:opacity-50"
        />
        {termHistory.length > 0 && (
          <button
            onClick={() => setTermHistory([])}
            title="Clear (Ctrl+L)"
            className="text-[10px] text-muted-foreground/30 hover:text-emerald-400/70 font-mono ml-2">
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
        <p className="text-[11px] text-muted-foreground/30 font-mono">
          No app selected
        </p>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col bg-black overflow-hidden">
      <div className="flex items-center justify-between px-3 h-6 border-b border-border/5 shrink-0 bg-black/40">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40 font-mono">
          docker logs -t {selectedApp}
        </span>
        <button
          onClick={onRefresh}
          disabled={appLogsLoading}
          className="text-[9px] text-muted-foreground/30 hover:text-foreground/60 transition-colors disabled:opacity-30">
          {appLogsLoading ? '...' : <RefreshCw size={10} />}
        </button>
      </div>
      <pre
        ref={appLogsRef}
        className="flex-1 overflow-auto px-3 py-2 text-[10px] font-mono text-muted-foreground/70 leading-relaxed whitespace-pre-wrap break-words">
        {appLogs || (appLogsLoading ? 'Loading...' : '(no logs)')}
      </pre>
    </div>
  );
}

function EventsView({
  events,
  logRef,
}: {
  events: BuildEvent[];
  logRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={logRef}
      className="flex-1 overflow-auto px-2 py-1 min-h-0 bg-background">
      {events.length > 0 ? (
        <EventLog events={events} expanded />
      ) : (
        <p className="text-[10px] text-muted-foreground/20 text-center pt-6 font-mono">
          No events yet
        </p>
      )}
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
      return <EventsView events={props.events} logRef={props.logRef} />;
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
                  : 'text-muted-foreground/40 hover:text-foreground/70 hover:bg-white/[0.03]'
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
            className="p-1 rounded text-muted-foreground/40 hover:text-foreground/70 hover:bg-white/[0.03] transition-colors">
            <Minus size={11} />
          </button>
          <button
            onClick={() =>
              props.setState(props.state === 'expanded' ? 'normal' : 'expanded')
            }
            title={props.state === 'expanded' ? 'Restore' : 'Maximize'}
            className="p-1 rounded text-muted-foreground/40 hover:text-foreground/70 hover:bg-white/[0.03] transition-colors">
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
