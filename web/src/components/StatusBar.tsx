import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatUptime } from '@/lib/format';
import type { SystemInfo } from '@/lib/types';

interface StatusBarProps {
  sys: SystemInfo | null;
  nodeCount: number;
  appCount: number;
  logsOpen: boolean;
  onToggleLogs: () => void;
}

export function StatusBar({
  sys,
  nodeCount,
  appCount,
  logsOpen,
  onToggleLogs,
}: StatusBarProps) {
  return (
    <footer className="h-7 shrink-0 bg-muted/15 border-t border-border/30 flex items-center px-4 gap-4 text-[11px] font-mono text-muted-foreground">
      {sys ? (
        <>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {sys.hostname}
          </span>
          <span className="text-border/60">│</span>
          <span>Up {formatUptime(sys.uptime_seconds)}</span>
          <span className="text-border/60">│</span>
          <span className="flex items-center gap-1.5">
            CPU
            <span className="w-16 h-1.5 rounded-full bg-muted inline-block overflow-hidden align-middle">
              <span
                className="block h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${sys.cpu.used_pct}%` }}
              />
            </span>
            <span className="tabular-nums w-7 text-right">
              {sys.cpu.used_pct.toFixed(0)}%
            </span>
          </span>
          <span className="text-border/60">│</span>
          <span className="flex items-center gap-1.5">
            Mem
            <span className="w-16 h-1.5 rounded-full bg-muted inline-block overflow-hidden align-middle">
              <span
                className="block h-full rounded-full bg-purple-500 transition-all"
                style={{ width: `${sys.memory.used_pct}%` }}
              />
            </span>
            <span className="tabular-nums w-7 text-right">
              {sys.memory.used_pct.toFixed(0)}%
            </span>
          </span>
          <span className="text-border/60">│</span>
          <span className="flex items-center gap-1.5">
            Disk
            <span className="w-16 h-1.5 rounded-full bg-muted inline-block overflow-hidden align-middle">
              <span
                className="block h-full rounded-full bg-amber-500 transition-all"
                style={{ width: `${sys.disk.used_pct}%` }}
              />
            </span>
            <span className="tabular-nums w-7 text-right">
              {sys.disk.used_pct.toFixed(0)}%
            </span>
          </span>
          <span className="ml-auto flex items-center gap-3">
            <span>
              {nodeCount} node{nodeCount !== 1 ? 's' : ''}
            </span>
            <span>
              {appCount} app{appCount !== 1 ? 's' : ''}
            </span>
            <button
              onClick={onToggleLogs}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                logsOpen
                  ? 'text-foreground bg-foreground/10'
                  : 'hover:text-foreground'
              }`}>
              {logsOpen ? (
                <>
                  <ChevronDown size={12} className="inline" /> Logs
                </>
              ) : (
                <>
                  <ChevronRight size={12} className="inline" /> Logs
                </>
              )}
            </button>
          </span>
        </>
      ) : (
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 border border-zinc-500/50 border-t-zinc-400 rounded-full animate-spin" />
          Connecting...
        </span>
      )}
    </footer>
  );
}
