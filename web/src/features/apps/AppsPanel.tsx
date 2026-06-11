import {
  Activity,
  Blocks,
  Bug,
  Circle,
  Columns2,
  ExternalLink,
  GitBranch,
  History,
  ListTree,
  PanelLeft,
  Rocket,
  Rows3,
  Search,
  Settings,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react';
import { API_BASE } from '@/lib/api';
import { appsApi } from '@/features/apps/api';
import { guessIcon } from '@/lib/icons';
import { PageLayout } from '@/app/PageLayout';
import { ClarifyWizard } from '@/features/apps/components/ClarifyWizard';
import { BuildWizard } from '@/features/apps/components/BuildWizard';
import { useState } from 'react';
import { AppSidebar } from '@/features/apps/components/AppSidebar';
import { AppActions } from '@/features/apps/components/AppActionsPanel';
import { DiffView } from '@/features/apps/components/DiffView';
import { EventLog } from '@/features/apps/components/BuildPanel';
import {
  CodeEditor,
  FileTreeNode,
} from '@/features/apps/components/CodeEditor';
import { BottomPanel } from '@/features/apps/components/BottomPanel';
import { useAppsPanel } from '@/features/apps/hooks/useAppsPanel';

export function ExpertAppsPanel({
  headerCenter,
}: {
  headerCenter?: React.ReactNode;
} = {}) {
  const {
    app,
    appLogs,
    appLogsLoading,
    appLogsRef,
    apps,
    bottomSplit,
    bottomSplitTab,
    bottomState,
    bottomTab,
    buildWithAnswers,
    building,
    cancelBuild,
    clarifyAnswers,
    clarifyError,
    clarifyLoading,
    clarifyName,
    clarifyNotes,
    clarifyOpen,
    clarifyQuestions,
    claritySummary,
    commitChanges,
    commits,
    committing,
    containerStats,
    deleteApp,
    deployApp,
    deployEvents,
    deploying,
    diffLayout,
    diffMode,
    diffSha,
    diffText,
    doSearch,
    editIcon,
    editRoute,
    events,
    expandedDirs,
    ext,
    fileContent,
    fileDirty,
    fileLoading,
    fileSaving,
    fileSearch,
    files,
    gitOpen,
    loadCommits,
    logRef,
    openClarify,
    prompt,
    runBuildWith,
    runTermCmd,
    saveFile,
    saveSettings,
    saveToast,
    searchResults,
    searching,
    selectedApp,
    selectedFile,
    setAppLogs,
    setAppLogsLoading,
    setBottomSplit,
    setBottomSplitTab,
    setBottomState,
    setBottomTab,
    setClarifyAnswers,
    setClarifyName,
    setClarifyNotes,
    setClarifyOpen,
    setDiffLayout,
    setDiffMode,
    setDiffSha,
    setEditIcon,
    setEditRoute,
    setFileContent,
    setFileDirty,
    setFileSearch,
    setGitOpen,
    setPrompt,
    setSearchResults,
    setSelectedApp,
    setSelectedFile,
    setSettingsOpen,
    setTermCmd,
    setTermHistory,
    settingsOpen,
    skipClarifyAndBuild,
    startFix,
    startRebuild,
    termCmd,
    termHistory,
    termRef,
    termRunning,
    toggleDir,
    tree,
  } = useAppsPanel();

  // Local: BuildWizard visibility (the canonical 4-step pipeline).
  // Sidebar's "New App" / openClarify is repurposed to open this wizard.
  const [wizardOpen, setWizardOpen] = useState(false);
  // Right-panel app description: truncated by default, expandable.
  const [descExpanded, setDescExpanded] = useState(false);
  void openClarify; // wizard is local now; keep destructure for API stability

  // Toolbar rendered into the page header (right side). Shows the
  // selected app/file context + Save / Commit / Open actions.
  const toolbar = selectedApp ? (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex items-center gap-1.5 min-w-0 max-w-[40vw]">
        <span className="text-muted-foreground/65 shrink-0">{selectedApp}</span>
        {selectedFile && (
          <>
            <span className="text-muted-foreground/20 shrink-0">/</span>
            <span className="text-muted-foreground/60 truncate">
              {selectedFile}
            </span>
          </>
        )}
        {fileDirty && (
          <span className="text-amber-400/80 shrink-0">
            <Circle size={6} fill="currentColor" />
          </span>
        )}
        {fileLoading && (
          <span className="text-blue-400/60 text-xs animate-pulse shrink-0">
            loading
          </span>
        )}
      </div>
      <div className="flex items-center gap-0.5 text-xs shrink-0">
        {saveToast && (
          <span className="px-2 py-0.5 text-xs text-emerald-300/80 bg-emerald-500/10 border border-emerald-500/20 rounded mr-1 truncate max-w-[260px]">
            ✓ {saveToast}
          </span>
        )}
        {/* Lifecycle/AI actions live in the right-side AppActions rail; this
            top bar only handles file-level operations. */}
        <button
          onClick={saveFile}
          disabled={!fileDirty || fileSaving}
          title="Save the current file (⌘S). Click Deploy to rebuild the container."
          className="px-2 py-0.5 text-muted-foreground/70 hover:text-foreground disabled:opacity-20 transition-colors">
          {fileSaving ? '...' : 'Save'}
        </button>
        <span className="text-border/20">│</span>
        <button
          onClick={commitChanges}
          disabled={committing}
          title="git commit -am — snapshots all working-tree changes so they appear in Changes."
          className="px-2 py-0.5 text-violet-300/70 hover:text-violet-300 disabled:opacity-30 transition-colors flex items-center gap-1">
          <GitBranch size={10} /> {committing ? '...' : 'Commit'}
        </button>
        {app?.status === 'running' && (
          <>
            <span className="text-border/20">│</span>
            <button
              onClick={() =>
                window.open(`${API_BASE}/apps/${selectedApp}/`, '_blank')
              }
              className="px-2 py-0.5 text-muted-foreground/70 hover:text-foreground transition-colors">
              Open <ExternalLink size={10} className="inline" />
            </button>
          </>
        )}
      </div>
    </div>
  ) : undefined;

  return (
    <PageLayout title="Apps" toolbar={toolbar} headerCenter={headerCenter} fullBleed>
      {/* Mobile fallback — the IDE-style layout doesn't fit < lg.
          Beautiful launcher: hero CTA + app cards. */}
      <div className="lg:hidden flex-1 overflow-y-auto p-4 space-y-5">
        {/* Hero — build a new app */}
        <div className="rounded-xl border border-border/40 bg-card/40 p-5 space-y-3">
          <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-primary/15 text-primary">
            <Sparkles size={18} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Build with AI
            </h3>
            <p className="text-sm text-muted-foreground/85 mt-1">
              Describe an app — the agent scaffolds, writes code, and deploys it for you.
            </p>
          </div>
          <button
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-colors">
            <Rocket size={15} /> New app
          </button>
        </div>

        {/* App list */}
        <div className="space-y-3">
          <div className="flex items-end justify-between px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/85">
              Your apps
            </h3>
            <span className="text-xs text-muted-foreground/70 tabular-nums">
              {apps.length}
            </span>
          </div>
          {apps.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/40 bg-card/20 p-8 text-center">
              <Blocks size={28} className="mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground/85">
                No apps yet. Tap "New app" to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {apps.map((a) => {
                const isRunning = a.status === 'running';
                const isFailed = a.status === 'failed';
                const statusColor = isRunning
                  ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/25'
                  : isFailed
                    ? 'text-rose-300 bg-rose-500/15 border-rose-500/25'
                    : 'text-amber-300 bg-amber-500/15 border-amber-500/25';
                return (
                  <div
                    key={a.name}
                    className="group rounded-2xl border border-border/40 bg-card/40 p-4 flex items-center gap-3 hover:border-primary/40 hover:bg-card/60 transition-colors">
                    <div className="shrink-0 inline-flex items-center justify-center h-12 w-12 rounded-xl bg-white/5 text-3xl leading-none">
                      {a.icon || guessIcon(a.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground truncate">
                        {a.name}
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1.5">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border ${statusColor} capitalize`}>
                          {a.status}
                        </span>
                      </div>
                    </div>
                    {isRunning && (
                      <button
                        onClick={() =>
                          window.open(`${API_BASE}/apps/${a.name}/`, '_blank')
                        }
                        aria-label={`Open ${a.name}`}
                        className="shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-xl bg-primary/15 text-primary hover:bg-primary/25 active:scale-95 transition-all">
                        <ExternalLink size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground/65 px-1 pt-2">
            Tip: open this dashboard on a desktop browser for the full code editor & terminal.
          </p>
        </div>
      </div>

      {/* Desktop IDE layout */}
      <div
        className={`hidden lg:flex min-h-0 overflow-hidden ${bottomState === 'expanded' ? 'flex-none h-0' : 'flex-1'}`}>
        {/* ── Left: App sidebar ── */}
        <AppSidebar
          apps={apps}
          selectedApp={selectedApp}
          setSelectedApp={setSelectedApp}
          building={building}
          openClarify={() => setWizardOpen(true)}
          cancelBuild={cancelBuild}
          setPrompt={setPrompt}
        />

        {/* ── Center: Code editor ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedApp ? (
            <>
              <div className="flex flex-1 min-h-0">
                {/* File tree + search */}
                <div className="w-40 shrink-0 border-r border-border/10 flex flex-col overflow-hidden">
                  {/* Search */}
                  <div className="px-1.5 py-1 border-b border-border/5">
                    <div className="relative">
                      <Search
                        size={10}
                        className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/30"
                      />
                      <input
                        value={fileSearch}
                        onChange={(e) => setFileSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                        placeholder="Search files..."
                        className="w-full h-5 text-xs bg-transparent border border-border/10 rounded pl-5 pr-1 focus:outline-none focus:border-border/30 placeholder:text-muted-foreground/20"
                      />
                    </div>
                  </div>
                  {/* Search results or file tree */}
                  <div className="flex-1 overflow-auto py-1">
                    {searchResults.length > 0 ? (
                      <div className="space-y-0.5">
                        <button
                          onClick={() => {
                            setSearchResults([]);
                            setFileSearch('');
                          }}
                          className="w-full text-xs text-muted-foreground/30 hover:text-muted-foreground/60 px-2 py-0.5 text-left">
                          <X size={8} className="inline mr-0.5" /> Clear results
                          ({searchResults.length})
                        </button>
                        {searchResults.map((r, i) => (
                          <button
                            key={i}
                            onClick={() => setSelectedFile(r.file)}
                            className={`w-full text-left px-2 py-0.5 hover:bg-white/[0.03] transition-colors ${selectedFile === r.file ? 'bg-white/[0.04]' : ''}`}>
                            <div className="text-xs text-foreground/60 font-mono truncate">
                              {r.file}
                            </div>
                            <div className="text-xs text-muted-foreground/30 truncate">
                              L{r.line}: {r.text}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : searching ? (
                      <p className="text-xs text-muted-foreground/30 text-center py-2 animate-pulse">
                        Searching...
                      </p>
                    ) : (
                      <>
                        {tree.map((node) => (
                          <FileTreeNode
                            key={node.path}
                            node={node}
                            depth={0}
                            selectedFile={selectedFile}
                            onSelect={(path) => {
                              if (
                                !fileDirty ||
                                confirm('Discard unsaved changes?')
                              )
                                setSelectedFile(path);
                            }}
                            expanded={expandedDirs}
                            onToggle={toggleDir}
                          />
                        ))}
                        {files.length === 0 && (
                          <div className="p-4 text-center">
                            <p className="text-xs text-muted-foreground/30">
                              {building ? 'Generating...' : 'No files'}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Editor with syntax highlighting */}
                <div className="flex-1 min-w-0 min-h-0">
                  {selectedFile ? (
                    <CodeEditor
                      value={fileContent}
                      onChange={(code) => {
                        setFileContent(code);
                        setFileDirty(true);
                      }}
                      ext={ext}
                      onSave={saveFile}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground/20 text-xs bg-[#0d1117]">
                      Select a file
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-muted-foreground/30">
                Describe an app in the prompt below to get started.
              </p>
            </div>
          )}
        </div>

        {/* ── Right: App info / settings panel ── */}
        <div className="w-72 shrink-0 border-l border-border/10 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-1.5 h-8 px-3 border-b border-border/10 shrink-0 text-xs uppercase tracking-wider text-muted-foreground/65">
            <Blocks size={11} />
            App
            {(building || deploying) && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-auto">
              {selectedApp && app ? (
                  <div className="p-3 space-y-3">
                    {/* ─── Live build/deploy events (right-panel, replaces bottom log) ─── */}
                    {(deploying || building || deployEvents.length > 0) && (
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground/65 flex items-center gap-1.5 px-1">
                          <Activity size={9} /> Live Events
                          {(deploying || building) && (
                            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          )}
                        </div>
                        <div className="p-2 rounded-lg max-h-48 overflow-auto border bg-white/[0.02] border-border/10">
                          {deployEvents.length > 0 ? (
                            <EventLog events={deployEvents} />
                          ) : (
                            <div className="text-xs text-muted-foreground/65 italic">
                              Working…
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ─── Identity ─── */}
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02] border border-border/10">
                      <span className="text-2xl">
                        {app.icon || guessIcon(app.name)}
                      </span>
                      <div>
                        <h3 className="text-xs font-semibold">{app.name}</h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              app.status === 'running'
                                ? 'bg-emerald-500'
                                : app.status === 'building'
                                  ? 'bg-amber-500 animate-pulse'
                                  : app.status === 'failed'
                                    ? 'bg-red-500'
                                    : 'bg-zinc-500'
                            }`}
                          />
                          <span className="text-xs text-muted-foreground/60 capitalize">
                            {app.status}
                          </span>
                          <span className="text-xs text-muted-foreground/30">
                            :{app.port}
                          </span>
                        </div>
                      </div>
                    </div>

                    {app.prompt && (
                      <div className="px-1">
                        <p
                          className={`text-xs text-muted-foreground/70 leading-relaxed whitespace-pre-wrap ${
                            descExpanded ? '' : 'line-clamp-3'
                          }`}>
                          {app.prompt}
                        </p>
                        {app.prompt.length > 140 && (
                          <button
                            onClick={() => setDescExpanded((v) => !v)}
                            className="mt-1 text-xs uppercase tracking-wider text-muted-foreground/65 hover:text-muted-foreground/70 transition-colors">
                            {descExpanded ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </div>
                    )}

                    {app.error && (
                      <div className="p-2.5 bg-red-500/5 border border-red-500/15 rounded-lg">
                        <div className="text-xs uppercase tracking-wider text-red-400/60 mb-1 flex items-center gap-1.5">
                          <Bug size={9} /> Error
                        </div>
                        <p className="text-xs text-red-400/70 font-mono whitespace-pre-wrap">
                          {app.error}
                        </p>
                      </div>
                    )}

                    {/* ─── Actions (shared with Simple mode) ─── */}
                    <AppActions
                      app={app}
                      onOpen={() =>
                        window.open(
                          `${API_BASE}${app.route || `/apps/${app.name}/`}`,
                          '_blank',
                        )
                      }
                      onRestart={async () => {
                        await appsApi.restartApp(app.name);
                      }}
                      onStop={async () => {
                        await appsApi.stopApp(app.name);
                      }}
                      onDelete={async () => {
                        if (
                          !confirm(
                            `Delete ${app.name}? This cancels any running build, removes the container, and wipes the project files.`,
                          )
                        )
                          return;
                        await deleteApp(app.name);
                      }}
                      onRedeploy={() => deployApp()}
                      onAutoFix={() => startFix()}
                      onFeature={() => {
                        const change = window.prompt(
                          `Describe what to change or add to '${app.name}':`,
                          '',
                        );
                        if (change && change.trim())
                          startRebuild(change.trim());
                      }}
                      onFix={() => {
                        const desc = window.prompt(
                          `Describe what to fix in '${app.name}':`,
                          '',
                        );
                        if (desc && desc.trim()) startFix(desc.trim());
                      }}
                      onBug={() => {
                        const desc = window.prompt(
                          `Describe the bug in '${app.name}' (what you saw vs. what you expected):`,
                          '',
                        );
                        if (desc && desc.trim()) startFix(desc.trim());
                      }}
                    />

                    {/* ─── Resources ─── */}
                    <div className="space-y-1.5">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground/65 flex items-center gap-1.5 px-1">
                        <Activity size={9} /> Resources
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="p-2 bg-white/[0.02] rounded text-xs">
                          <span className="text-muted-foreground/65">
                            Files
                          </span>
                          <p className="text-foreground/60 mt-0.5">
                            {files.length}
                          </p>
                        </div>
                        <div className="p-2 bg-white/[0.02] rounded text-xs">
                          <span className="text-muted-foreground/65">
                            Route
                          </span>
                          <p className="text-foreground/60 mt-0.5 font-mono">
                            {app.route}
                          </p>
                        </div>
                        {containerStats && (
                          <>
                            <div className="p-2 bg-white/[0.02] rounded text-xs">
                              <span className="text-muted-foreground/65">
                                CPU
                              </span>
                              <p className="text-foreground/60 mt-0.5 font-mono">
                                {containerStats.cpu || '—'}
                              </p>
                            </div>
                            <div className="p-2 bg-white/[0.02] rounded text-xs">
                              <span className="text-muted-foreground/65">
                                Memory
                              </span>
                              <p className="text-foreground/60 mt-0.5 font-mono text-xs">
                                {containerStats.mem || '—'}
                              </p>
                            </div>
                            <div className="p-2 bg-white/[0.02] rounded text-xs">
                              <span className="text-muted-foreground/65">
                                Network
                              </span>
                              <p className="text-foreground/60 mt-0.5 font-mono text-xs">
                                {containerStats.net || '—'}
                              </p>
                            </div>
                            <div className="p-2 bg-white/[0.02] rounded text-xs">
                              <span className="text-muted-foreground/65">
                                PIDs
                              </span>
                              <p className="text-foreground/60 mt-0.5 font-mono">
                                {containerStats.pids || '—'}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Build History */}
                    {app.builds && app.builds.length > 0 && (
                      <div className="pt-1 space-y-1.5">
                        <button
                          onClick={() => setSettingsOpen((v) => !v)}
                          className="flex items-center gap-1 text-xs text-muted-foreground/65 hover:text-muted-foreground/60 w-full">
                          <History size={10} /> Build History (
                          {app.builds.length})
                        </button>
                        <div className="space-y-1 max-h-40 overflow-auto">
                          {[...app.builds].reverse().map((b, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 text-xs py-0.5">
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}
                              />
                              <span className="text-muted-foreground/70 capitalize">
                                {b.action}
                              </span>
                              <span className="text-muted-foreground/30 flex-1 truncate font-mono">
                                {b.prompt}
                              </span>
                              <span className="text-muted-foreground/30 tabular-nums shrink-0">
                                {b.duration}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Git change log (per-app local repo) */}
                    {commits.length > 0 && (
                      <div className="pt-3 border-t border-border/10 space-y-1.5">
                        <button
                          onClick={() => setGitOpen((v) => !v)}
                          className="flex items-center gap-1 text-xs text-muted-foreground/65 hover:text-muted-foreground/60 w-full">
                          <GitBranch size={10} /> Changes ({commits.length})
                          <span className="ml-auto text-muted-foreground/30">
                            {gitOpen ? '−' : '+'}
                          </span>
                        </button>
                        {gitOpen && (
                          <div className="space-y-1 max-h-60 overflow-auto">
                            {commits.map((c) => (
                              <div
                                key={c.sha}
                                className="group w-full flex items-center gap-2 text-xs py-1 px-1.5 rounded hover:bg-white/[0.03] transition-colors">
                                <button
                                  onClick={() => setDiffSha(c.sha)}
                                  className="flex-1 min-w-0 flex items-center gap-2 text-left">
                                  <span className="font-mono text-muted-foreground/65 shrink-0">
                                    {c.short_sha}
                                  </span>
                                  {c.action && (
                                    <span
                                      className={`text-xs uppercase shrink-0 ${
                                        c.action === 'fix'
                                          ? 'text-amber-400/70'
                                          : c.action === 'rebuild'
                                            ? 'text-violet-400/70'
                                            : c.action === 'build'
                                              ? 'text-emerald-400/70'
                                              : c.action === 'revert'
                                                ? 'text-red-400/70'
                                                : 'text-muted-foreground/70'
                                      }`}>
                                      {c.action}
                                    </span>
                                  )}
                                  <span className="text-foreground/70 flex-1 truncate">
                                    {c.subject.replace(
                                      /^(build|fix|rebuild|deploy|revert):\s*/,
                                      '',
                                    )}
                                  </span>
                                  {c.files ? (
                                    <span className="text-muted-foreground/65 tabular-nums shrink-0">
                                      {c.files}f
                                    </span>
                                  ) : null}
                                  <span className="text-muted-foreground/30 tabular-nums shrink-0">
                                    {new Date(c.timestamp).toLocaleDateString(
                                      undefined,
                                      { month: 'short', day: 'numeric' },
                                    )}
                                  </span>
                                </button>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <button
                                    title="Revert this change (creates a new commit)"
                                    onClick={async () => {
                                      if (!selectedApp) return;
                                      if (
                                        !confirm(
                                          `Revert ${c.short_sha}?\n\n"${c.subject}"\n\nThis creates a new commit that undoes the change. You can deploy after to apply it.`,
                                        )
                                      )
                                        return;
                                      try {
                                        await appsApi.revertCommit(
                                          selectedApp!,
                                          c.sha,
                                        );
                                        loadCommits();
                                      } catch (e) {
                                        alert(
                                          'Revert failed: ' +
                                            (e instanceof Error
                                              ? e.message
                                              : 'unknown'),
                                        );
                                      }
                                    }}
                                    className="p-1 rounded hover:bg-red-500/15 text-red-400/70 hover:text-red-300">
                                    <Undo2 size={10} />
                                  </button>
                                  <button
                                    title="Deploy current files (rebuild Docker image)"
                                    onClick={() => deployApp()}
                                    disabled={deploying}
                                    className="p-1 rounded hover:bg-emerald-500/15 text-emerald-400/70 hover:text-emerald-300 disabled:opacity-30">
                                    <Rocket size={10} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Settings */}
                    <div className="pt-3 border-t border-border/10 space-y-2">
                      <button
                        onClick={() => {
                          setSettingsOpen((v) => !v);
                          setEditIcon(app.icon || '');
                          setEditRoute(app.route || '');
                        }}
                        className="flex items-center gap-1 text-xs text-muted-foreground/65 hover:text-muted-foreground/60">
                        <Settings size={10} /> Settings
                      </button>
                      {settingsOpen && (
                        <div className="space-y-2 p-2 bg-white/[0.02] rounded">
                          <div className="space-y-0.5">
                            <span className="text-xs text-muted-foreground/30">
                              Icon
                            </span>
                            <input
                              value={editIcon}
                              onChange={(e) => setEditIcon(e.target.value)}
                              placeholder="emoji..."
                              className="w-full h-6 text-xs bg-transparent border border-border/15 rounded px-2 focus:outline-none focus:border-foreground/20"
                            />
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-xs text-muted-foreground/30">
                              Route
                            </span>
                            <input
                              value={editRoute}
                              onChange={(e) => setEditRoute(e.target.value)}
                              className="w-full h-6 text-xs font-mono bg-transparent border border-border/15 rounded px-2 focus:outline-none focus:border-foreground/20"
                            />
                          </div>
                          <button
                            onClick={saveSettings}
                            className="w-full py-1 text-xs text-foreground/60 bg-foreground/5 hover:bg-foreground/10 rounded transition-colors">
                            Save Settings
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Git diff modal */}
                    {diffSha && (
                      <div
                        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setDiffSha(null)}>
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="w-full max-w-6xl h-[85vh] bg-[#0a0a0a] border border-white/10 rounded-lg shadow-2xl flex flex-col">
                          <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10">
                            <GitBranch
                              size={12}
                              className="text-violet-400/70"
                            />
                            <span className="text-xs font-mono text-foreground/80">
                              {diffSha.slice(0, 12)}
                            </span>
                            <span className="text-xs text-muted-foreground/60 truncate flex-1">
                              {commits.find((c) => c.sha === diffSha)
                                ?.subject || ''}
                            </span>
                            <div className="flex items-center bg-white/5 rounded text-xs overflow-hidden">
                              <button
                                onClick={() => setDiffLayout('single')}
                                title="One file at a time (sidebar)"
                                className={`px-2 py-1 ${diffLayout === 'single' ? 'bg-violet-500/20 text-violet-200' : 'text-muted-foreground/70 hover:text-foreground'}`}>
                                <PanelLeft
                                  size={11}
                                  className="inline mr-0.5"
                                />{' '}
                                Files
                              </button>
                              <button
                                onClick={() => setDiffLayout('all')}
                                title="Scroll all files"
                                className={`px-2 py-1 ${diffLayout === 'all' ? 'bg-violet-500/20 text-violet-200' : 'text-muted-foreground/70 hover:text-foreground'}`}>
                                <Rows3 size={11} className="inline mr-0.5" />{' '}
                                All
                              </button>
                            </div>
                            <div className="flex items-center bg-white/5 rounded text-xs overflow-hidden">
                              <button
                                onClick={() => setDiffMode('split')}
                                className={`px-2 py-1 ${diffMode === 'split' ? 'bg-violet-500/20 text-violet-200' : 'text-muted-foreground/70 hover:text-foreground'}`}>
                                <Columns2 size={11} className="inline mr-0.5" />{' '}
                                Split
                              </button>
                              <button
                                onClick={() => setDiffMode('unified')}
                                className={`px-2 py-1 ${diffMode === 'unified' ? 'bg-violet-500/20 text-violet-200' : 'text-muted-foreground/70 hover:text-foreground'}`}>
                                <ListTree size={11} className="inline mr-0.5" />{' '}
                                Unified
                              </button>
                            </div>
                            <button
                              onClick={() => setDiffSha(null)}
                              className="p-1 text-muted-foreground/70 hover:text-foreground rounded hover:bg-white/5">
                              <X size={12} />
                            </button>
                          </div>
                          <div className="flex-1 p-3 min-h-0 overflow-hidden">
                            {diffText === 'Loading…' ? (
                              <div className="text-xs text-muted-foreground/60">
                                Loading…
                              </div>
                            ) : (
                              <DiffView
                                diff={diffText}
                                mode={diffMode}
                                layout={diffLayout}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center h-full">
                    <p className="text-xs text-muted-foreground/20">
                      No app selected
                    </p>
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom: Tabbed Events / Logs / Terminal panel (desktop only) ── */}
      <div className="hidden lg:contents">
        <BottomPanel
          state={bottomState}
          setState={setBottomState}
          tab={bottomTab}
          setTab={setBottomTab}
          split={bottomSplit}
          setSplit={setBottomSplit}
          splitTab={bottomSplitTab}
          setSplitTab={setBottomSplitTab}
          events={events}
          logRef={logRef}
          selectedApp={selectedApp}
          appStatus={app?.status}
          appLogs={appLogs}
          appLogsLoading={appLogsLoading}
          appLogsRef={appLogsRef}
          onRefreshLogs={() => {
            if (!selectedApp) return;
            setAppLogsLoading(true);
            appsApi
              .getLogs(selectedApp, 200)
              .then((d) => setAppLogs(d?.logs || ''))
              .catch(() => setAppLogs('Failed'))
              .finally(() => setAppLogsLoading(false));
          }}
          termCmd={termCmd}
          setTermCmd={setTermCmd}
          termHistory={termHistory}
          setTermHistory={setTermHistory}
          termRunning={termRunning}
          termRef={termRef}
          runTermCmd={runTermCmd}
        />
      </div>

      {/* ── AI Build wizard (the canonical pipeline:
          draft → AI brief → questions → final-prompt preview → build) ── */}
      {wizardOpen && (
        <BuildWizard
          initialPrompt={prompt}
          onClose={() => setWizardOpen(false)}
          onBuild={(assembledPrompt, name) => {
            setWizardOpen(false);
            runBuildWith(assembledPrompt, name);
          }}
        />
      )}

      {/* ── Legacy single-pane Clarify wizard (kept for hook compatibility;
          renders only if the hook still flips clarifyOpen) ── */}
      {clarifyOpen && false && (
        <ClarifyWizard
          prompt={prompt}
          setPrompt={setPrompt}
          loading={clarifyLoading}
          error={clarifyError}
          summary={claritySummary}
          questions={clarifyQuestions}
          answers={clarifyAnswers}
          setAnswers={setClarifyAnswers}
          name={clarifyName}
          setName={setClarifyName}
          notes={clarifyNotes}
          setNotes={setClarifyNotes}
          onClose={() => setClarifyOpen(false)}
          onRegenerate={openClarify}
          onSkip={skipClarifyAndBuild}
          onBuild={buildWithAnswers}
        />
      )}
    </PageLayout>
  );
}

/* ── HomeKit Panel ── */

/* ── Chat Panel (Streaming with Sessions) ── */
