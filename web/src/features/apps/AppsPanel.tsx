import { Activity, Blocks, Bug, Circle, Columns2, Cpu, ExternalLink, GitBranch, History, ListTree, MessageSquare, Package, PanelLeft, Play, RefreshCw, Rocket, Rows3, Search, Settings, Sparkles, Undo2, Wrench, X, Zap } from 'lucide-react';
import { API_BASE } from '@/lib/api';
import { appsApi } from '@/features/apps/api';
import { guessIcon } from '@/lib/icons';
import { ClarifyWizard } from '@/features/apps/components/ClarifyWizard';
import { AppSidebar } from '@/features/apps/components/AppSidebar';
import { DiffView } from '@/features/apps/components/DiffView';
import { EventLog } from '@/features/apps/components/BuildPanel';
import { CodeEditor, FileTreeNode } from '@/features/apps/components/CodeEditor';
import { BottomPanel } from '@/features/apps/components/BottomPanel';
import { useAppsPanel } from '@/features/apps/hooks/useAppsPanel';

export function AppsPanel() {
  const {
    actionType,
    app,
    appLogs,
    appLogsLoading,
    appLogsRef,
    applyFileBlock,
    apps,
    bottomSplit,
    bottomSplitTab,
    bottomState,
    bottomTab,
    buildWithAnswers,
    building,
    cancelBuild,
    changeInput,
    chatInput,
    chatInputRef,
    chatLoading,
    chatMessages,
    chatRef,
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
    extractFileBlocks,
    fileContent,
    fileDirty,
    fileLoading,
    fileSaving,
    fileSearch,
    files,
    gitOpen,
    loadCommits,
    logRef,
    mentionIndex,
    mentionOpen,
    mentionQuery,
    openClarify,
    prompt,
    restartApp,
    rightTab,
    runTermCmd,
    saveFile,
    saveSettings,
    saveToast,
    searchResults,
    searching,
    selectedApp,
    selectedBuildNode,
    selectedFile,
    sendChat,
    setActionType,
    setAppLogs,
    setAppLogsLoading,
    setBottomSplit,
    setBottomSplitTab,
    setBottomState,
    setBottomTab,
    setChangeInput,
    setChatInput,
    setChatMessages,
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
    setMentionIndex,
    setMentionOpen,
    setMentionQuery,
    setPrompt,
    setRightTab,
    setSearchResults,
    setSelectedApp,
    setSelectedBuildNode,
    setSelectedFile,
    setSettingsOpen,
    setTermCmd,
    setTermHistory,
    settingsOpen,
    skipClarifyAndBuild,
    startFix,
    startRebuild,
    stopApp,
    termCmd,
    termHistory,
    termRef,
    termRunning,
    toggleDev,
    toggleDir,
    tree,
    workerNodes,
  } = useAppsPanel();

  return (
    <div className="flex flex-col h-full">
      <div
        className={`flex min-h-0 overflow-hidden ${bottomState === 'expanded' ? 'flex-none h-0' : 'flex-1'}`}>
        {/* ── Left: App sidebar ── */}
        <AppSidebar
          apps={apps}
          selectedApp={selectedApp}
          setSelectedApp={setSelectedApp}
          building={building}
          openClarify={openClarify}
          cancelBuild={cancelBuild}
          setPrompt={setPrompt}
        />

        {/* ── Center: Code editor ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedApp ? (
            <>
              {/* Editor toolbar — flat */}
              <div className="flex items-center justify-between px-3 h-8 border-b border-border/10 shrink-0 overflow-hidden">
                <div className="flex items-center gap-1.5 min-w-0 flex-1 text-[11px]">
                  <span className="text-muted-foreground/40 shrink-0">
                    {selectedApp}
                  </span>
                  {selectedFile && (
                    <>
                      <span className="text-muted-foreground/20 shrink-0">
                        /
                      </span>
                      <span className="text-muted-foreground/60 truncate min-w-0">
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
                    <span className="text-blue-400/60 text-[9px] animate-pulse shrink-0">
                      loading
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-0.5 text-[10px] shrink-0 ml-2">
                  {saveToast && (
                    <span className="px-2 py-0.5 text-[9px] text-emerald-300/80 bg-emerald-500/10 border border-emerald-500/20 rounded mr-1 truncate max-w-[260px]">
                      ✓ {saveToast}
                    </span>
                  )}
                  <button
                    onClick={saveFile}
                    disabled={!fileDirty || fileSaving}
                    title="Save the current file (⌘S). Hot reload will pick it up automatically."
                    className="px-2 py-0.5 text-muted-foreground/50 hover:text-foreground disabled:opacity-20 transition-colors">
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
                          window.open(
                            `${API_BASE}/apps/${selectedApp}/`,
                            '_blank',
                          )
                        }
                        className="px-2 py-0.5 text-muted-foreground/50 hover:text-foreground transition-colors">
                        Open <ExternalLink size={10} className="inline" />
                      </button>
                    </>
                  )}
                </div>
              </div>

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
                        className="w-full h-5 text-[9px] bg-transparent border border-border/10 rounded pl-5 pr-1 focus:outline-none focus:border-border/30 placeholder:text-muted-foreground/20"
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
                          className="w-full text-[8px] text-muted-foreground/30 hover:text-muted-foreground/60 px-2 py-0.5 text-left">
                          <X size={8} className="inline mr-0.5" /> Clear results
                          ({searchResults.length})
                        </button>
                        {searchResults.map((r, i) => (
                          <button
                            key={i}
                            onClick={() => setSelectedFile(r.file)}
                            className={`w-full text-left px-2 py-0.5 hover:bg-white/[0.03] transition-colors ${selectedFile === r.file ? 'bg-white/[0.04]' : ''}`}>
                            <div className="text-[9px] text-foreground/60 font-mono truncate">
                              {r.file}
                            </div>
                            <div className="text-[8px] text-muted-foreground/30 truncate">
                              L{r.line}: {r.text}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : searching ? (
                      <p className="text-[9px] text-muted-foreground/30 text-center py-2 animate-pulse">
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
                            <p className="text-[10px] text-muted-foreground/30">
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
              <div className="text-center space-y-4 max-w-xs">
                <p className="text-sm text-muted-foreground/30">
                  Select an app or build a new one
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      label: 'Todo App',
                      prompt:
                        'Build a modern todo app with categories, due dates, and drag-to-reorder',
                    },
                    {
                      label: 'Weather',
                      prompt:
                        'Build a weather dashboard that shows current weather and 5-day forecast for any city',
                    },
                    {
                      label: 'Notes',
                      prompt:
                        'Build a markdown notes app with sidebar, live preview, and local storage',
                    },
                    {
                      label: 'Pomodoro',
                      prompt:
                        'Build a pomodoro timer with session tracking, break reminders, and statistics',
                    },
                    {
                      label: 'Habit Tracker',
                      prompt:
                        'Build a daily habit tracker with streaks, calendar view, and progress charts',
                    },
                    {
                      label: 'Bookmarks',
                      prompt:
                        'Build a bookmark manager with tags, search, and card previews',
                    },
                  ].map((t) => (
                    <button
                      key={t.label}
                      onClick={() => {
                        setPrompt(t.prompt);
                      }}
                      className="px-3 py-2 text-[11px] text-muted-foreground/50 hover:text-foreground/70 bg-white/[0.02] hover:bg-white/[0.05] border border-border/10 rounded-lg transition-colors text-left">
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Tabbed panel ── */}
        <div className="w-72 shrink-0 border-l border-border/10 flex flex-col overflow-hidden">
          {/* Tab bar — settings + AI assistant */}
          <div className="flex h-8 border-b border-border/10 shrink-0">
            {(['info', 'chat'] as const).map((tab) => {
              const icons = { info: Blocks, chat: MessageSquare };
              const labels = { info: 'Settings', chat: 'AI Assistant' };
              const Icon = icons[tab];
              return (
                <button
                  key={tab}
                  onClick={() => setRightTab(tab)}
                  title={labels[tab]}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-[9px] uppercase tracking-wider transition-colors ${
                    rightTab === tab
                      ? 'text-foreground/70 border-b border-foreground/30'
                      : 'text-muted-foreground/30 hover:text-muted-foreground/60'
                  }`}>
                  <Icon size={11} />
                  {labels[tab]}
                  {tab === 'chat' && (building || deploying) && (
                    <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* ── Info tab ── */}
            {rightTab === 'info' && (
              <div className="flex-1 overflow-auto">
                {selectedApp && app ? (
                  <div className="p-3 space-y-3">
                    {/* ─── Hot reload status banner (top of panel) ─── */}
                    {app.dev_mode && (
                      <div
                        className={`px-2.5 py-2 rounded-lg border flex items-center gap-2 text-[11px] ${
                          app.dev_running
                            ? 'bg-amber-500/10 border-amber-500/25 text-amber-200'
                            : 'bg-red-500/10 border-red-500/30 text-red-200'
                        }`}>
                        {app.dev_running ? (
                          <Zap
                            size={12}
                            className="animate-pulse"
                            fill="currentColor"
                          />
                        ) : (
                          <Zap size={12} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">
                            {app.dev_running
                              ? '⚡ Hot reload active'
                              : '⚡ Hot mode ON · dev container is NOT running'}
                          </div>
                          <div className="text-[9px] opacity-70 truncate">
                            {app.dev_running
                              ? 'AI changes & Save apply via vite watch · page auto-reloads'
                              : 'Click Persist→Hot to revive, or Restart'}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ─── Live build/deploy events (right-panel, replaces bottom log) ─── */}
                    {(deploying || building || deployEvents.length > 0) && (
                      <div className="space-y-1">
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 flex items-center gap-1.5 px-1">
                          <Activity size={9} /> Live Events
                          {(deploying || building) && (
                            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          )}
                        </div>
                        <div
                          className={`p-2 rounded-lg max-h-48 overflow-auto border ${
                            deployEvents.some((e) => e.step === 'hot-reload')
                              ? 'bg-amber-500/5 border-amber-500/20'
                              : 'bg-white/[0.02] border-border/10'
                          }`}>
                          {deployEvents.length > 0 ? (
                            <EventLog events={deployEvents} />
                          ) : (
                            <div className="text-[10px] text-muted-foreground/40 italic">
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
                          <span className="text-[10px] text-muted-foreground/60 capitalize">
                            {app.status}
                          </span>
                          <span className="text-[10px] text-muted-foreground/30">
                            :{app.port}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground/50 leading-relaxed px-1">
                      {app.prompt}
                    </p>

                    {app.error && (
                      <div className="p-2.5 bg-red-500/5 border border-red-500/15 rounded-lg">
                        <div className="text-[9px] uppercase tracking-wider text-red-400/60 mb-1 flex items-center gap-1.5">
                          <Bug size={9} /> Error
                        </div>
                        <p className="text-[10px] text-red-400/70 font-mono whitespace-pre-wrap">
                          {app.error}
                        </p>
                      </div>
                    )}

                    {/* ─── Resources ─── */}
                    <div className="space-y-1.5">
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 flex items-center gap-1.5 px-1">
                        <Activity size={9} /> Resources
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="p-2 bg-white/[0.02] rounded text-[10px]">
                          <span className="text-muted-foreground/40">
                            Files
                          </span>
                          <p className="text-foreground/60 mt-0.5">
                            {files.length}
                          </p>
                        </div>
                        <div className="p-2 bg-white/[0.02] rounded text-[10px]">
                          <span className="text-muted-foreground/40">
                            Route
                          </span>
                          <p className="text-foreground/60 mt-0.5 font-mono">
                            {app.route}
                          </p>
                        </div>
                        {containerStats && (
                          <>
                            <div className="p-2 bg-white/[0.02] rounded text-[10px]">
                              <span className="text-muted-foreground/40">
                                CPU
                              </span>
                              <p className="text-foreground/60 mt-0.5 font-mono">
                                {containerStats.cpu || '—'}
                              </p>
                            </div>
                            <div className="p-2 bg-white/[0.02] rounded text-[10px]">
                              <span className="text-muted-foreground/40">
                                Memory
                              </span>
                              <p className="text-foreground/60 mt-0.5 font-mono text-[9px]">
                                {containerStats.mem || '—'}
                              </p>
                            </div>
                            <div className="p-2 bg-white/[0.02] rounded text-[10px]">
                              <span className="text-muted-foreground/40">
                                Network
                              </span>
                              <p className="text-foreground/60 mt-0.5 font-mono text-[9px]">
                                {containerStats.net || '—'}
                              </p>
                            </div>
                            <div className="p-2 bg-white/[0.02] rounded text-[10px]">
                              <span className="text-muted-foreground/40">
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

                    {/* ─── Quick Actions ─── */}
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 flex items-center gap-1.5 px-1">
                        <Play size={9} /> Quick Actions
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {app.status === 'running' && (
                          <button
                            onClick={() =>
                              window.open(
                                `${API_BASE}/apps/${app.name}/`,
                                '_blank',
                              )
                            }
                            className="flex-1 min-w-0 py-1.5 text-[10px] text-emerald-400/80 bg-emerald-500/5 rounded hover:bg-emerald-500/10 transition-colors">
                            Open <ExternalLink size={10} className="inline" />
                          </button>
                        )}
                        <button
                          onClick={deployApp}
                          disabled={deploying || building}
                          title={
                            app?.dev_mode
                              ? 'Full Docker rebuild + redeploy. (Hot reload normally avoids this — only use it for prod-style validation.)'
                              : 'Build the Docker image and restart the container.'
                          }
                          className="py-1.5 px-3 text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded hover:bg-emerald-500/15 disabled:opacity-30 transition-colors flex items-center gap-1">
                          <Rocket size={10} /> {deploying ? '...' : 'Deploy'}
                        </button>
                        <button
                          onClick={toggleDev}
                          disabled={building}
                          title={
                            app?.dev_mode
                              ? '⚡ Hot reload ON. Click to switch to a persistent (production-style) container.'
                              : '📦 Persistent container. Click to switch to ⚡ Hot reload (instant changes, vite watch).'
                          }
                          className={`py-1.5 px-3 text-[10px] rounded border transition-colors flex items-center gap-1 disabled:opacity-30 ${
                            app?.dev_mode
                              ? 'text-amber-300 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/15'
                              : 'text-muted-foreground/70 hover:text-foreground bg-white/[0.02] border-border/15 hover:bg-white/[0.04]'
                          }`}>
                          {app?.dev_mode ? (
                            <>
                              <Zap size={10} fill="currentColor" /> Hot
                            </>
                          ) : (
                            <>
                              <Package size={10} /> Persist
                            </>
                          )}
                        </button>
                        {app.status === 'running' && (
                          <button
                            onClick={() => stopApp(app.name)}
                            className="py-1.5 px-3 text-[10px] text-muted-foreground/50 hover:bg-white/[0.03] rounded transition-colors">
                            Stop
                          </button>
                        )}
                        {(app.status === 'running' ||
                          app.status === 'failed' ||
                          app.status === 'stopped') && (
                          <button
                            onClick={() => restartApp(app.name)}
                            title="Restart container (no rebuild)"
                            className="py-1.5 px-3 text-[10px] text-sky-400/70 hover:text-sky-300 bg-sky-500/5 hover:bg-sky-500/10 rounded transition-colors">
                            <RefreshCw size={10} className="inline mr-0.5" />{' '}
                            Restart
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm(`Delete ${app.name}?`))
                              deleteApp(app.name);
                          }}
                          className="py-1.5 px-3 text-[10px] text-red-400/50 hover:text-red-400 hover:bg-red-500/5 rounded transition-colors">
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Build History */}
                    {app.builds && app.builds.length > 0 && (
                      <div className="pt-1 space-y-1.5">
                        <button
                          onClick={() => setSettingsOpen((v) => !v)}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/60 w-full">
                          <History size={10} /> Build History (
                          {app.builds.length})
                        </button>
                        <div className="space-y-1 max-h-40 overflow-auto">
                          {[...app.builds].reverse().map((b, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 text-[9px] py-0.5">
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}
                              />
                              <span className="text-muted-foreground/50 capitalize">
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
                          className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/60 w-full">
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
                                className="group w-full flex items-center gap-2 text-[10px] py-1 px-1.5 rounded hover:bg-white/[0.03] transition-colors">
                                <button
                                  onClick={() => setDiffSha(c.sha)}
                                  className="flex-1 min-w-0 flex items-center gap-2 text-left">
                                  <span className="font-mono text-muted-foreground/40 shrink-0">
                                    {c.short_sha}
                                  </span>
                                  {c.action && (
                                    <span
                                      className={`text-[9px] uppercase shrink-0 ${
                                        c.action === 'fix'
                                          ? 'text-amber-400/70'
                                          : c.action === 'rebuild'
                                            ? 'text-violet-400/70'
                                            : c.action === 'build'
                                              ? 'text-emerald-400/70'
                                              : c.action === 'revert'
                                                ? 'text-red-400/70'
                                                : 'text-muted-foreground/50'
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
                                    <span className="text-muted-foreground/40 tabular-nums shrink-0">
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
                        className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/60">
                        <Settings size={10} /> Settings
                      </button>
                      {settingsOpen && (
                        <div className="space-y-2 p-2 bg-white/[0.02] rounded">
                          <div className="space-y-0.5">
                            <span className="text-[9px] text-muted-foreground/30">
                              Icon
                            </span>
                            <input
                              value={editIcon}
                              onChange={(e) => setEditIcon(e.target.value)}
                              placeholder="emoji..."
                              className="w-full h-6 text-[11px] bg-transparent border border-border/15 rounded px-2 focus:outline-none focus:border-foreground/20"
                            />
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[9px] text-muted-foreground/30">
                              Route
                            </span>
                            <input
                              value={editRoute}
                              onChange={(e) => setEditRoute(e.target.value)}
                              className="w-full h-6 text-[11px] font-mono bg-transparent border border-border/15 rounded px-2 focus:outline-none focus:border-foreground/20"
                            />
                          </div>
                          <button
                            onClick={saveSettings}
                            className="w-full py-1 text-[10px] text-foreground/60 bg-foreground/5 hover:bg-foreground/10 rounded transition-colors">
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
                            <span className="text-[11px] font-mono text-foreground/80">
                              {diffSha.slice(0, 12)}
                            </span>
                            <span className="text-[11px] text-muted-foreground/60 truncate flex-1">
                              {commits.find((c) => c.sha === diffSha)
                                ?.subject || ''}
                            </span>
                            <div className="flex items-center bg-white/5 rounded text-[10px] overflow-hidden">
                              <button
                                onClick={() => setDiffLayout('single')}
                                title="One file at a time (sidebar)"
                                className={`px-2 py-1 ${diffLayout === 'single' ? 'bg-violet-500/20 text-violet-200' : 'text-muted-foreground/50 hover:text-foreground'}`}>
                                <PanelLeft
                                  size={11}
                                  className="inline mr-0.5"
                                />{' '}
                                Files
                              </button>
                              <button
                                onClick={() => setDiffLayout('all')}
                                title="Scroll all files"
                                className={`px-2 py-1 ${diffLayout === 'all' ? 'bg-violet-500/20 text-violet-200' : 'text-muted-foreground/50 hover:text-foreground'}`}>
                                <Rows3 size={11} className="inline mr-0.5" />{' '}
                                All
                              </button>
                            </div>
                            <div className="flex items-center bg-white/5 rounded text-[10px] overflow-hidden">
                              <button
                                onClick={() => setDiffMode('split')}
                                className={`px-2 py-1 ${diffMode === 'split' ? 'bg-violet-500/20 text-violet-200' : 'text-muted-foreground/50 hover:text-foreground'}`}>
                                <Columns2 size={11} className="inline mr-0.5" />{' '}
                                Split
                              </button>
                              <button
                                onClick={() => setDiffMode('unified')}
                                className={`px-2 py-1 ${diffMode === 'unified' ? 'bg-violet-500/20 text-violet-200' : 'text-muted-foreground/50 hover:text-foreground'}`}>
                                <ListTree size={11} className="inline mr-0.5" />{' '}
                                Unified
                              </button>
                            </div>
                            <button
                              onClick={() => setDiffSha(null)}
                              className="p-1 text-muted-foreground/50 hover:text-foreground rounded hover:bg-white/5">
                              <X size={12} />
                            </button>
                          </div>
                          <div className="flex-1 p-3 min-h-0 overflow-hidden">
                            {diffText === 'Loading…' ? (
                              <div className="text-[11px] text-muted-foreground/60">
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
                    <p className="text-[10px] text-muted-foreground/20">
                      No app selected
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── AI Assistant tab (Make Changes + Chat) ── */}
            {rightTab === 'chat' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* ─── Make Changes (top of AI tab) ─── */}
                <div className="p-2.5 border-b border-border/10 space-y-2">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 flex items-center gap-1.5">
                    <Sparkles size={9} /> Make Changes
                  </div>
                  {/* Compute-node picker */}
                  <div className="flex items-center gap-1.5">
                    <Cpu
                      size={9}
                      className="text-muted-foreground/40 shrink-0"
                    />
                    <select
                      value={selectedBuildNode}
                      onChange={(e) => setSelectedBuildNode(e.target.value)}
                      disabled={building}
                      title="Compute node to run this task"
                      className="flex-1 bg-transparent border border-border/15 rounded text-[10px] py-1 px-1.5 focus:outline-none focus:border-violet-500/40 disabled:opacity-30">
                      <option value="">Auto (best available)</option>
                      {workerNodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                          {n.tier ? ` · ${n.tier}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setActionType('feature')}
                      className={`flex-1 py-1 text-[9px] rounded transition-colors ${
                        actionType === 'feature'
                          ? 'text-violet-400 bg-violet-500/10 border border-violet-500/20'
                          : 'text-muted-foreground/40 hover:bg-white/[0.03] border border-transparent'
                      }`}>
                      <Sparkles size={10} className="inline mr-0.5" /> Feature
                    </button>
                    <button
                      onClick={() => setActionType('fix')}
                      className={`flex-1 py-1 text-[9px] rounded transition-colors ${
                        actionType === 'fix'
                          ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
                          : 'text-muted-foreground/40 hover:bg-white/[0.03] border border-transparent'
                      }`}>
                      <Wrench size={10} className="inline mr-0.5" /> Fix
                    </button>
                    <button
                      onClick={() => setActionType('bug')}
                      className={`flex-1 py-1 text-[9px] rounded transition-colors ${
                        actionType === 'bug'
                          ? 'text-red-400 bg-red-500/10 border border-red-500/20'
                          : 'text-muted-foreground/40 hover:bg-white/[0.03] border border-transparent'
                      }`}>
                      <Bug size={10} className="inline mr-0.5" /> Bug
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={changeInput}
                      onChange={(e) => setChangeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && changeInput.trim()) {
                          if (actionType === 'feature')
                            startRebuild(changeInput);
                          else startFix(changeInput);
                          setChangeInput('');
                        }
                      }}
                      placeholder={
                        actionType === 'feature'
                          ? 'Add a feature... (e.g. dark mode, undo button)'
                          : actionType === 'fix'
                            ? 'Describe what to fix...'
                            : 'Describe the bug...'
                      }
                      disabled={building}
                      className="w-full bg-transparent border border-border/15 rounded text-[11px] py-1.5 px-2.5 pr-12 focus:outline-none focus:border-violet-500/40 placeholder:text-muted-foreground/20 transition-colors disabled:opacity-30"
                    />
                    <button
                      onClick={() => {
                        if (actionType === 'feature') startRebuild(changeInput);
                        else startFix(changeInput);
                        setChangeInput('');
                      }}
                      disabled={building || !changeInput.trim()}
                      className={`absolute right-1 top-1/2 -translate-y-1/2 text-[9px] px-2 py-0.5 rounded disabled:opacity-20 transition-colors ${
                        actionType === 'feature'
                          ? 'text-violet-400/60 hover:text-violet-400 bg-violet-500/5'
                          : actionType === 'fix'
                            ? 'text-amber-400/60 hover:text-amber-400 bg-amber-500/5'
                            : 'text-red-400/60 hover:text-red-400 bg-red-500/5'
                      }`}>
                      {actionType === 'feature' ? 'Add' : 'Fix'}
                    </button>
                  </div>
                  {actionType !== 'feature' && (
                    <button
                      onClick={() => startFix()}
                      disabled={building}
                      className="w-full py-1.5 text-[10px] text-amber-400/80 bg-amber-500/5 border border-amber-500/10 rounded hover:bg-amber-500/10 transition-colors disabled:opacity-30">
                      <Wrench size={10} className="inline mr-0.5" /> Auto-fix
                      from Logs
                    </button>
                  )}
                </div>

                {/* ─── Chat header ─── */}
                <div className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-wider text-muted-foreground/40 flex items-center gap-1.5">
                  <MessageSquare size={9} /> Chat with code assistant
                </div>

                {/* Messages */}
                <div
                  ref={chatRef}
                  className="flex-1 overflow-auto p-3 space-y-3">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-[10px] text-muted-foreground/25">
                        Code Assistant
                      </p>
                      <p className="text-[9px] text-muted-foreground/15 mt-1">
                        Has access to all {files.length} files in{' '}
                        {selectedApp || 'app'}
                      </p>
                      <p className="text-[9px] text-muted-foreground/30 mt-2">
                        Type{' '}
                        <span className="text-blue-400/70 font-mono">@</span> to
                        mention a file ·{' '}
                        <span className="text-amber-400/70 font-mono">
                          @app
                        </span>{' '}
                        = all files
                      </p>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => {
                    const isUser = msg.role === 'user';
                    const fileBlocks = !isUser
                      ? extractFileBlocks(msg.content)
                      : [];
                    // Remove file blocks from display text
                    let textContent = msg.content;
                    if (!isUser && fileBlocks.length > 0) {
                      textContent = textContent
                        .replace(
                          /### FILE:\s*\S+\s*\n```[\w]*\n[\s\S]*?```/g,
                          '',
                        )
                        .replace(/```[\w]*\n[\s\S]*?```/g, '')
                        .trim();
                    }
                    return (
                      <div key={i} className={`${isUser ? 'ml-6' : 'mr-2'}`}>
                        <div
                          className={`rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
                            isUser
                              ? 'bg-blue-500/10 text-blue-200/80 ml-auto'
                              : 'bg-white/3 text-muted-foreground/70'
                          }`}>
                          {textContent && (
                            <p className="whitespace-pre-wrap">{textContent}</p>
                          )}
                          {fileBlocks.map((fb, j) => (
                            <div key={j} className="mt-2">
                              {fb.path && (
                                <div className="text-[9px] text-muted-foreground/40 font-mono mb-1">
                                  {fb.path}
                                </div>
                              )}
                              <div className="bg-black/30 rounded p-2 overflow-auto max-h-48">
                                <pre className="text-[10px] font-mono text-gray-300/80 whitespace-pre-wrap">
                                  {fb.code.length > 500
                                    ? fb.code.slice(0, 500) + '\n...'
                                    : fb.code}
                                </pre>
                              </div>
                              <button
                                onClick={() => applyFileBlock(fb.path, fb.code)}
                                className="mt-1.5 text-[10px] text-emerald-400/70 hover:text-emerald-300 bg-emerald-500/5 px-2.5 py-1 rounded transition-colors">
                                Apply{' '}
                                {fb.path === selectedFile
                                  ? 'to editor'
                                  : `to ${fb.path}`}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {chatLoading && (
                    <div className="mr-2">
                      <div className="bg-white/3 rounded-lg px-3 py-2 text-[11px] text-muted-foreground/40 animate-pulse">
                        Thinking...
                      </div>
                    </div>
                  )}
                </div>

                {/* Chat input */}
                <div className="p-2.5 border-t border-border/10">
                  {selectedFile && (
                    <div className="text-[9px] text-muted-foreground/20 mb-1 font-mono truncate">
                      context: {selectedFile}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      {(() => {
                        // Compute the matching mention list (files + @app)
                        const opts: { value: string; desc: string }[] =
                          mentionOpen
                            ? [
                                {
                                  value: 'app',
                                  desc: `all ${files.length} files`,
                                },
                                ...files
                                  .map((f) => f.path)
                                  .filter((p) =>
                                    p
                                      .toLowerCase()
                                      .includes(mentionQuery.toLowerCase()),
                                  )
                                  .slice(0, 12)
                                  .map((p) => ({ value: p, desc: '' })),
                              ].filter((o) =>
                                mentionQuery
                                  ? o.value
                                      .toLowerCase()
                                      .includes(mentionQuery.toLowerCase()) ||
                                    o.value === 'app'
                                  : true,
                              )
                            : [];
                        const insertMention = (val: string) => {
                          // Replace the last "@<query>" with "@val "
                          const re = /@[\w./-]*$/;
                          const next = chatInput.replace(re, '@' + val + ' ');
                          setChatInput(next);
                          setMentionOpen(false);
                          setMentionQuery('');
                          setMentionIndex(0);
                          // Refocus input
                          requestAnimationFrame(() =>
                            chatInputRef.current?.focus(),
                          );
                        };
                        return (
                          <>
                            <input
                              ref={chatInputRef}
                              type="text"
                              value={chatInput}
                              onChange={(e) => {
                                const v = e.target.value;
                                setChatInput(v);
                                // Detect "@..." at the end (or before a space)
                                const m = v
                                  .slice(0, e.target.selectionStart || v.length)
                                  .match(/@([\w./-]*)$/);
                                if (m) {
                                  setMentionQuery(m[1]);
                                  setMentionOpen(true);
                                  setMentionIndex(0);
                                } else {
                                  setMentionOpen(false);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (mentionOpen && opts.length > 0) {
                                  if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    setMentionIndex(
                                      (i) => (i + 1) % opts.length,
                                    );
                                    return;
                                  }
                                  if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    setMentionIndex(
                                      (i) =>
                                        (i - 1 + opts.length) % opts.length,
                                    );
                                    return;
                                  }
                                  if (
                                    e.key === 'Tab' ||
                                    (e.key === 'Enter' && mentionOpen)
                                  ) {
                                    e.preventDefault();
                                    insertMention(opts[mentionIndex].value);
                                    return;
                                  }
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setMentionOpen(false);
                                    return;
                                  }
                                }
                                if (e.key === 'Enter') sendChat();
                              }}
                              placeholder="Ask about the code… type @ to mention files"
                              disabled={chatLoading}
                              className="w-full bg-transparent border-0 border-b border-border/15 text-xs py-1.5 pr-6 focus:outline-none focus:border-blue-500/30 placeholder:text-muted-foreground/25 transition-colors"
                            />
                            {mentionOpen && opts.length > 0 && (
                              <div className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-auto bg-[#0a0a0a] border border-white/10 rounded-lg shadow-xl z-30">
                                {opts.map((o, i) => (
                                  <button
                                    key={o.value + i}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      insertMention(o.value);
                                    }}
                                    onMouseEnter={() => setMentionIndex(i)}
                                    className={`w-full text-left px-2 py-1 text-[11px] flex items-center gap-2 ${
                                      i === mentionIndex
                                        ? 'bg-blue-500/15 text-foreground'
                                        : 'text-foreground/70 hover:bg-white/[0.04]'
                                    }`}>
                                    <span
                                      className={
                                        o.value === 'app'
                                          ? 'text-amber-400'
                                          : 'text-blue-400/70'
                                      }>
                                      @{o.value}
                                    </span>
                                    {o.desc && (
                                      <span className="text-[9px] text-muted-foreground/40 ml-auto">
                                        {o.desc}
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <button
                      onClick={sendChat}
                      disabled={chatLoading || !chatInput.trim()}
                      className="shrink-0 text-[10px] text-muted-foreground/30 hover:text-foreground disabled:opacity-20 transition-colors px-1">
                      ↑
                    </button>
                    {chatMessages.length > 0 && (
                      <button
                        onClick={() => setChatMessages([])}
                        className="shrink-0 text-[9px] text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors px-1">
                        clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom: Tabbed Events / Logs / Terminal panel ── */}
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

      {/* ── AI Clarify wizard ── */}
      {clarifyOpen && (
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
    </div>
  );
}

/* ── HomeKit Panel ── */

/* ── Chat Panel (Streaming with Sessions) ── */

