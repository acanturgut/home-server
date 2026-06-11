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

  // True when the *selected* app is server-side stuck in `building` even
  // though no local NDJSON stream is wired up — usually means the build
  // goroutine died with the previous server process.
  const selectedIsStaleBuilding =
    !building &&
    !!selectedApp &&
    apps.some((a) => a.name === selectedApp && a.status === 'building');

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

  const statusLabel = (status: string) =>
    status === 'running'
      ? 'Running'
      : status === 'building'
        ? 'Building'
        : status === 'failed'
          ? 'Failed'
          : 'Stopped';

  return (
    <div className="w-64 shrink-0 border-r border-border/15 flex flex-col bg-background/40">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Apps</h2>
          <p className="text-xs text-muted-foreground/75">
            {apps.length === 0
              ? 'No apps yet — start by creating one.'
              : `${apps.length} app${apps.length === 1 ? '' : 's'}`}
          </p>
        </div>

        <button
          onClick={() => {
            setPrompt('');
            openClarify();
          }}
          disabled={building}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-primary bg-primary/10 hover:bg-primary/15 border border-primary/20 rounded-md transition-colors disabled:opacity-30">
          <Sparkles size={12} className={building ? 'animate-pulse' : ''} />
          {building ? 'Building…' : 'New App'}
        </button>
        {(building || selectedIsStaleBuilding) && (
          <button
            onClick={cancelBuild}
            className="w-full py-1 text-xs text-red-400/70 hover:text-red-400 transition-colors">
            ✕ {selectedIsStaleBuilding ? 'Cancel stale build' : 'Cancel build'}
          </button>
        )}

        {apps.length > 4 && (
          <div className="relative">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40"
            />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
              className="w-full h-7 text-xs bg-transparent border border-border/20 rounded-md pl-7 pr-2 focus:outline-none focus:border-border/40 placeholder:text-muted-foreground/30"
            />
          </div>
        )}
      </div>

      {/* Grouped list — matches Settings sidebar pattern */}
      <div className="flex-1 overflow-auto px-3 pb-4 space-y-4">
        {apps.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <p className="text-xs text-muted-foreground/55">
              Click <span className="text-primary/80">New App</span> to begin.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-2 py-4 text-center">
            <p className="text-xs text-muted-foreground/55">No matches.</p>
          </div>
        ) : (
          groups.map((g) => {
            const isCollapsed = !!collapsed[g.key];
            return (
              <div key={g.key} className="space-y-1.5">
                <button
                  onClick={() =>
                    setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))
                  }
                  className="w-full flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 hover:text-foreground/90 transition-colors">
                  <span className="flex items-center gap-1">
                    <ChevronRight
                      size={9}
                      className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                    />
                    {g.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground/55">
                    {g.items.length}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden divide-y divide-border/30">
                    {g.items.map((a) => {
                      const icon = a.icon || guessIcon(a.name);
                      const isSelected = selectedApp === a.name;
                      return (
                        <button
                          key={a.name}
                          onClick={() => setSelectedApp(a.name)}
                          title={a.name}
                          className={`w-full flex items-start gap-2 px-3 py-2.5 text-left transition-colors ${
                            isSelected
                              ? 'bg-primary/10 text-foreground'
                              : 'text-foreground/85 hover:bg-white/5'
                          }`}>
                          <span className="text-sm leading-none shrink-0 w-4 text-center mt-0.5">
                            {icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {a.name}
                            </div>
                            <div className="text-xs text-muted-foreground/75 mt-0.5 flex items-center gap-1.5">
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass(a.status)}`}
                              />
                              <span className="truncate">
                                {statusLabel(a.status)}
                                {a.dev_running ? ' · dev' : ''}
                              </span>
                            </div>
                          </div>
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
