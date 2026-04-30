import { useState } from 'react';
import { ChevronRight, Sparkles, Search } from 'lucide-react';
import { guessIcon } from '@/lib/icons';
import type { AppInfo } from '@/lib/types';

/**
 * Left panel of the Apps view. Apps are grouped by status (running →
 * building → stopped → failed), with a quick-filter input, an accent bar on
 * the active row, and consistent right-aligned status indicators.
 */
export function AppSidebar({
  apps,
  selectedApp,
  setSelectedApp,
  building,
  openClarify,
  cancelBuild,
  setPrompt,
}: {
  apps: AppInfo[];
  selectedApp: string | null;
  setSelectedApp: (name: string | null) => void;
  building: boolean;
  openClarify: () => void;
  cancelBuild: () => void;
  setPrompt: (p: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = filter.trim()
    ? apps.filter((a) => a.name.toLowerCase().includes(filter.toLowerCase()))
    : apps;

  // Group order: running first, then building, then stopped, then failed/other
  const groups: { key: string; label: string; items: AppInfo[] }[] = [
    {
      key: 'running',
      label: 'Running',
      items: filtered.filter((a) => a.status === 'running'),
    },
    {
      key: 'building',
      label: 'Building',
      items: filtered.filter((a) => a.status === 'building'),
    },
    {
      key: 'stopped',
      label: 'Stopped',
      items: filtered.filter(
        (a) =>
          a.status !== 'running' &&
          a.status !== 'building' &&
          a.status !== 'failed',
      ),
    },
    {
      key: 'failed',
      label: 'Failed',
      items: filtered.filter((a) => a.status === 'failed'),
    },
  ].filter((g) => g.items.length > 0);

  const dotClass = (status: string) =>
    status === 'running'
      ? 'bg-emerald-500'
      : status === 'building'
        ? 'bg-amber-500 animate-pulse'
        : status === 'failed'
          ? 'bg-red-500'
          : 'bg-zinc-600';

  return (
    <div className="w-52 shrink-0 border-r border-border/10 flex flex-col bg-background/40">
      {/* Header: title + count */}
      <div className="px-3 pt-2.5 pb-1.5 flex items-center justify-between">
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 font-medium">
          Apps
        </div>
        <div className="text-[9px] text-muted-foreground/30 tabular-nums">
          {apps.length}
        </div>
      </div>

      {/* New App button */}
      <div className="px-2.5 pb-2">
        <button
          onClick={() => {
            setPrompt('');
            openClarify();
          }}
          disabled={building}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-primary bg-primary/10 hover:bg-primary/15 border border-primary/20 rounded transition-colors disabled:opacity-30">
          <Sparkles size={11} className={building ? 'animate-pulse' : ''} />
          {building ? 'Building…' : 'New App'}
        </button>
        {building && (
          <button
            onClick={cancelBuild}
            className="mt-1 w-full py-1 text-[9px] text-red-400/70 hover:text-red-400 transition-colors">
            ✕ Cancel build
          </button>
        )}
      </div>

      {/* Filter */}
      {apps.length > 4 && (
        <div className="px-2.5 pb-2">
          <div className="relative">
            <Search
              size={10}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/30"
            />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
              className="w-full h-6 text-[10px] bg-transparent border border-border/10 rounded pl-6 pr-2 focus:outline-none focus:border-border/30 placeholder:text-muted-foreground/25"
            />
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-auto pb-2">
        {apps.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-[10px] text-muted-foreground/30">
              No apps yet — click{' '}
              <span className="text-primary/70">New App</span> to begin.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-4 text-center">
            <p className="text-[10px] text-muted-foreground/30">No matches</p>
          </div>
        ) : (
          groups.map((g) => {
            const isCollapsed = !!collapsed[g.key];
            return (
              <div key={g.key} className="mt-1.5 first:mt-0">
                <button
                  onClick={() =>
                    setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))
                  }
                  className="w-full flex items-center justify-between px-3 py-1 text-[8.5px] uppercase tracking-wider text-muted-foreground/35 hover:text-muted-foreground/60 transition-colors">
                  <span className="flex items-center gap-1">
                    <ChevronRight
                      size={8}
                      className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                    />
                    {g.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground/30">
                    {g.items.length}
                  </span>
                </button>
                {!isCollapsed && (
                  <div>
                    {g.items.map((a) => {
                      const icon = a.icon || guessIcon(a.name);
                      const isSelected = selectedApp === a.name;
                      return (
                        <button
                          key={a.name}
                          onClick={() => setSelectedApp(a.name)}
                          title={a.name}
                          className={`group relative w-full flex items-center gap-2 pl-3 pr-2.5 py-1.5 text-left transition-colors ${
                            isSelected
                              ? 'bg-white/[0.05]'
                              : 'hover:bg-white/[0.025]'
                          }`}>
                          {/* Active accent bar */}
                          <span
                            className={`absolute left-0 top-1 bottom-1 w-0.5 rounded-r ${
                              isSelected ? 'bg-violet-400/70' : 'bg-transparent'
                            }`}
                          />
                          <span className="text-sm leading-none shrink-0 w-4 text-center">
                            {icon}
                          </span>
                          <span
                            className={`flex-1 min-w-0 truncate text-[11px] ${
                              isSelected
                                ? 'text-foreground font-medium'
                                : 'text-muted-foreground/70 group-hover:text-foreground/85'
                            }`}>
                            {a.name}
                          </span>
                          {a.dev_running && (
                            <span
                              title="Dev container running"
                              className="text-[8px] px-1 rounded bg-blue-500/15 text-blue-300/80 leading-tight">
                              dev
                            </span>
                          )}
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass(a.status)}`}
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
