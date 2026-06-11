import { Button } from '@/components/ui/button';
import {
  Archive,
  Blocks,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Cpu,
  Download,
  GitBranch,
  Globe,
  Mic,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Send,
  Square,
  Star,
  Trash2,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import { copyToClipboard, gotoPage, relTime } from '@/lib/format';
import { speak, stopSpeaking } from '@/lib/voice';
import { SLASH_COMMANDS } from '@/lib/slash';
import { CompareBlock, MarkdownView } from '@/lib/markdown';
import type { ChatMsg } from '@/features/chat/types';
import { SearchPalette } from '@/features/chat/components/SearchPalette';
import { SchedulesModal } from '@/features/chat/components/SchedulesModal';
import { PersonaQuickAdd } from '@/features/chat/components/PersonaQuickAdd';

import { useChatPanel } from '@/features/chat/hooks/useChatPanel';

export function ChatPanel() {
  const {
    exportSession,
    saveSnippet,
    active,
    activeId,
    atBottom,
    attachments,
    branchFrom,
    cancelEdit,
    collapsedReasoning,
    compareRoutes,
    deleteSession,
    displayMessages,
    dragOver,
    editingId,
    editingText,
    fileInputRef,
    filteredSessions,
    input,
    inputRef,
    insertMention,
    lastUserMsg,
    listening,
    loading,
    mentionState,
    messagesScrollRef,
    micStart,
    micStop,
    micSupported,
    newSession,
    nodesList,
    onFiles,
    onPasteCompose,
    onPickFiles,
    pendingModel,
    persistPersonas,
    personas,
    quickMode,
    regenerate,
    regenerateOnRoute,
    resumeBanner,
    saveEditAndResend,
    schedulesOpen,
    searchOpen,
    searchQ,
    send,
    sessionTokens,
    sessions,
    setActiveId,
    setAttachments,
    setCollapsedReasoning,
    setCompareRoutes,
    setDragOver,
    setEditingText,
    setInput,
    setPendingModel,
    setQuickMode,
    setResumeBanner,
    setSchedulesOpen,
    setSearchOpen,
    setSearchQ,
    setShowFilter,
    setShowSlash,
    setSideOpen,
    setStatusMsg,
    setSystemEditOpen,
    setToolsEnabled,
    setTtsOn,
    setWebEnabled,
    showFilter,
    showSlash,
    sideOpen,
    startEdit,
    statusMsg,
    stop,
    systemEditOpen,
    toggleArchive,
    togglePin,
    toggleStar,
    toolsEnabled,
    ttsOn,
    updateActive,
    webEnabled,
  } = useChatPanel();

  return (
    <div className="flex h-full relative">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />

      {/* Sessions sidebar — inline ≥sm, overlay drawer on mobile */}
      {sideOpen && (
        <div
          className="sm:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setSideOpen(false)}
        />
      )}
      <div
        className={`${sideOpen ? 'w-[78vw] max-w-[16rem] sm:w-60 translate-x-0' : 'w-0 -translate-x-full sm:translate-x-0'} fixed sm:relative inset-y-0 left-0 z-40 sm:z-auto transition-all overflow-hidden border-r border-border/10 bg-background sm:bg-background/40 shrink-0 flex flex-col`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="px-3 pt-2.5 pb-1.5 flex items-center justify-between">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 font-medium">
              Chats
            </div>
            <div className="text-[9px] text-muted-foreground/30 tabular-nums">
              {sessions.length}
            </div>
          </div>

          {/* New Chat */}
          <div className="px-2.5 pb-2">
            <button
              onClick={() => newSession()}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-primary bg-primary/10 hover:bg-primary/15 border border-primary/20 rounded transition-colors">
              <Plus size={11} /> New Chat
            </button>
          </div>

          {/* Filter pills */}
          <div className="px-2.5 pb-1.5">
            <div className="flex gap-0.5 text-[9.5px] bg-white/[0.02] rounded p-0.5">
              {(['all', 'pinned', 'archived'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setShowFilter(f)}
                  className={`flex-1 py-1 rounded transition-colors capitalize ${
                    showFilter === f
                      ? 'bg-foreground/10 text-foreground'
                      : 'text-muted-foreground/50 hover:text-foreground'
                  }`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Search + Schedules */}
          <div className="px-2.5 pb-2 space-y-1">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] text-muted-foreground/50 hover:text-foreground border border-border/15 rounded hover:bg-white/[0.03] transition-colors">
              <Search size={10} />
              <span className="flex-1 text-left">Search…</span>
              <span className="text-[9px] opacity-50">⌘K</span>
            </button>
            <button
              onClick={() => setSchedulesOpen(true)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] text-muted-foreground/50 hover:text-foreground border border-border/15 rounded hover:bg-white/[0.03] transition-colors">
              <Clock size={10} />
              <span className="flex-1 text-left">Schedules…</span>
            </button>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-auto pb-2 px-1">
            {filteredSessions.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-[10px] text-muted-foreground/30">
                  No sessions
                </p>
              </div>
            ) : (
              filteredSessions.map((s) => {
                const isActive = s.id === activeId;
                const msgCount = s.messages.filter(
                  (m) => m.role !== 'system' && !m.stepType,
                ).length;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setActiveId(s.id);
                      try {
                        localStorage.setItem('chat-active', s.id);
                      } catch {
                        /* ignore */
                      }
                      // Auto-close drawer on mobile after picking a session
                      if (
                        typeof window !== 'undefined' &&
                        window.matchMedia('(max-width: 639px)').matches
                      ) {
                        setSideOpen(false);
                      }
                    }}
                    title={s.title || 'Untitled'}
                    className={`group relative w-full flex items-start gap-1.5 pl-3 pr-1.5 py-1.5 text-left rounded transition-colors ${
                      isActive ? 'bg-white/[0.05]' : 'hover:bg-white/[0.025]'
                    }`}>
                    {/* Active accent bar */}
                    <span
                      className={`absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r ${
                        isActive ? 'bg-violet-400/70' : 'bg-transparent'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        {s.pinned && (
                          <Pin size={9} className="text-violet-400 shrink-0" />
                        )}
                        {s.starred && (
                          <Star size={9} className="text-amber-400 shrink-0" />
                        )}
                        <span
                          className={`flex-1 truncate text-[11px] ${
                            isActive
                              ? 'text-foreground font-medium'
                              : 'text-muted-foreground/75 group-hover:text-foreground/85'
                          }`}>
                          {s.title || 'Untitled'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[9px] text-muted-foreground/35 mt-0.5">
                        <span>{relTime(s.updatedAt)}</span>
                        {msgCount > 0 && (
                          <>
                            <span>·</span>
                            <span>{msgCount} msg</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="sm:opacity-0 sm:group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
                      <span
                        title={s.pinned ? 'Unpin' : 'Pin'}
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(s.id);
                        }}
                        className="p-0.5 text-muted-foreground/50 hover:text-violet-300 cursor-pointer">
                        <Pin size={10} />
                      </span>
                      <span
                        title={s.archived ? 'Unarchive' : 'Archive'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleArchive(s.id);
                        }}
                        className="p-0.5 text-muted-foreground/50 hover:text-foreground cursor-pointer">
                        <Archive size={10} />
                      </span>
                      <span
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${s.title}"?`))
                            deleteSession(s.id);
                        }}
                        className="p-0.5 text-red-400/70 hover:text-red-300 cursor-pointer">
                        <Trash2 size={10} />
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 border-b border-border/20 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setSideOpen(!sideOpen)}
            aria-label="Toggle sessions"
            className="text-muted-foreground hover:text-foreground text-base p-1 -ml-1 shrink-0">
            ☰
          </button>
          <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
            {active?.title || 'Chat'}
          </span>
          {active && (
            <>
              <button
                onClick={() => setSystemEditOpen((v) => !v)}
                title="System prompt / persona"
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${active.system ? 'border-violet-400/40 text-violet-300' : 'border-border/30 text-muted-foreground/60 hover:text-foreground'}`}>
                {active.system ? 'system ✓' : '+ system'}
              </button>
              <button
                onClick={() => toggleStar(active.id)}
                title="Star"
                className={`p-1 rounded hover:bg-white/5 ${active.starred ? 'text-amber-400' : 'text-muted-foreground/40'}`}>
                <Star size={12} />
              </button>
              <button
                onClick={exportSession}
                title="Export as Markdown"
                className="p-1 rounded hover:bg-white/5 text-muted-foreground/60 hover:text-foreground">
                <Download size={12} />
              </button>
              <button
                onClick={() =>
                  setTtsOn((v) => {
                    if (v) stopSpeaking();
                    return !v;
                  })
                }
                title={ttsOn ? 'Disable speech' : 'Speak replies'}
                className={`p-1 rounded hover:bg-white/5 ${ttsOn ? 'text-violet-300' : 'text-muted-foreground/40'}`}>
                <Volume2 size={12} />
              </button>
              {sessionTokens > 0 && (
                <span className="hidden sm:inline text-[10px] text-muted-foreground/50 font-mono ml-1">
                  {sessionTokens} tok
                </span>
              )}
            </>
          )}
        </div>

        {/* Resume banner */}
        {resumeBanner && (
          <div className="px-4 py-2 text-[11px] bg-amber-500/10 border-b border-amber-500/20 text-amber-200/90 flex items-center justify-between">
            <span>
              The previous request was interrupted. The reply may be missing.
            </span>
            <button
              onClick={() => setResumeBanner(false)}
              className="text-amber-200/70 hover:text-amber-100">
              <X size={12} />
            </button>
          </div>
        )}

        {/* System prompt editor */}
        {systemEditOpen && active && (
          <div className="px-4 py-3 border-b border-border/20 bg-white/[0.02] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
                System prompt / persona
              </span>
              <div className="flex items-center gap-1">
                {personas.map((p) => (
                  <button
                    key={p.id}
                    onClick={() =>
                      updateActive((s) => ({ ...s, system: p.system }))
                    }
                    title={p.name}
                    className="text-[10px] px-2 py-0.5 rounded border border-border/30 text-muted-foreground/70 hover:text-foreground hover:bg-white/5">
                    {p.emoji} {p.name}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={active.system || ''}
              onChange={(e) =>
                updateActive((s) => ({ ...s, system: e.target.value }))
              }
              rows={3}
              placeholder="e.g. You are a Rust expert. Reply in code-first style."
              className="w-full bg-black/30 border border-white/10 rounded p-2 text-[12px] text-foreground/90 placeholder:text-muted-foreground/30 focus:outline-none focus:border-violet-400/40 resize-none"
            />
            <div className="flex items-center gap-2 text-[10px]">
              <label className="text-muted-foreground/60">Temp</label>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={active.temperature ?? 0.7}
                onChange={(e) =>
                  updateActive((s) => ({
                    ...s,
                    temperature: parseFloat(e.target.value),
                  }))
                }
                className="w-16 bg-black/30 border border-white/10 rounded px-1 py-0.5 text-foreground/80 font-mono"
              />
              <label className="text-muted-foreground/60 ml-2">
                Default route
              </label>
              <select
                value={active.modelOverride || 'auto'}
                onChange={(e) =>
                  updateActive((s) => ({ ...s, modelOverride: e.target.value }))
                }
                className="bg-black/30 border border-white/10 rounded px-1 py-0.5 text-foreground/80">
                <option value="auto">auto</option>
                <option value="local">local (ollama)</option>
                <option value="light">light</option>
                <option value="heavy">heavy</option>
                {nodesList.map((n) => (
                  <option key={n.name} value={n.name}>
                    {n.name}
                  </option>
                ))}
              </select>
              <span className="ml-auto text-muted-foreground/40">
                Saved per chat
              </span>
            </div>
          </div>
        )}

        {/* Messages — centered column */}
        <div
          ref={messagesScrollRef}
          className={`flex-1 overflow-auto relative ${dragOver ? 'ring-2 ring-inset ring-violet-400/40 bg-violet-500/5' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragOver) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
          }}>
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20 text-violet-200 text-sm">
              Drop to attach files
            </div>
          )}
          <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
            {displayMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="text-2xl opacity-20">◇</div>
                <p className="text-sm text-muted-foreground/50">
                  {active?.system
                    ? 'Persona active — send a message to begin'
                    : 'Send a message to start chatting'}
                </p>
                {active?.system && (
                  <div className="text-[10px] text-violet-300/60 max-w-md truncate font-mono px-4 py-1 border border-violet-400/20 rounded-full">
                    system: {active.system.slice(0, 80)}
                    {active.system.length > 80 ? '…' : ''}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 justify-center max-w-lg">
                  {SLASH_COMMANDS.slice(0, 10).map((c) => (
                    <button
                      key={c.cmd}
                      onClick={() => {
                        setInput(c.cmd + ' ');
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      title={c.hint}
                      className="text-[10px] px-2 py-1 rounded border border-border/30 text-muted-foreground/60 hover:text-foreground hover:bg-white/5 font-mono">
                      {c.cmd}
                    </button>
                  ))}
                </div>
                <div className="hidden sm:flex text-[10px] text-muted-foreground/30 flex-wrap gap-x-3 gap-y-1 justify-center max-w-md">
                  <span>⌘N new</span>
                  <span>⌘K search</span>
                  <span>⌘/ focus</span>
                  <span>⌘↵ send</span>
                  <span>Esc stop</span>
                </div>
              </div>
            )}

            {/* Group consecutive system steps into a single collapsible reasoning block */}
            {(() => {
              const out: React.ReactNode[] = [];
              let i = 0;
              while (i < displayMessages.length) {
                const m = displayMessages[i];
                if (m.role === 'system' || m.stepType) {
                  let j = i;
                  const group: ChatMsg[] = [];
                  while (
                    j < displayMessages.length &&
                    (displayMessages[j].role === 'system' ||
                      displayMessages[j].stepType)
                  ) {
                    group.push(displayMessages[j]);
                    j++;
                  }
                  const groupKey = `g-${group[0].id}`;
                  const collapsed =
                    collapsedReasoning[groupKey] ?? group.length > 2;
                  out.push(
                    <div key={groupKey} className="text-[11px]">
                      <button
                        onClick={() =>
                          setCollapsedReasoning((p) => ({
                            ...p,
                            [groupKey]: !collapsed,
                          }))
                        }
                        className="flex items-center gap-1 text-muted-foreground/50 hover:text-muted-foreground/80">
                        {collapsed ? (
                          <ChevronRight size={10} />
                        ) : (
                          <ChevronDown size={10} />
                        )}
                        Reasoning ({group.length})
                      </button>
                      {!collapsed && (
                        <div className="ml-3 mt-1 space-y-1">
                          {group.map((g) => (
                            <div key={g.id} className="flex items-center gap-2">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  g.stepType === 'classified'
                                    ? 'bg-violet-400'
                                    : g.stepType === 'generating'
                                      ? 'bg-blue-400 animate-pulse'
                                      : g.stepType === 'classifying'
                                        ? 'bg-zinc-400 animate-pulse'
                                        : g.stepType === 'searching'
                                          ? 'bg-blue-400 animate-pulse'
                                          : g.stepType === 'error'
                                            ? 'bg-red-400'
                                            : 'bg-zinc-400'
                                }`}
                              />
                              <span className="text-muted-foreground">
                                {g.content}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>,
                  );
                  i = j;
                  continue;
                }
                if (m.role === 'user') {
                  out.push(
                    <div key={m.id} className="flex justify-end group">
                      {editingId === m.id ? (
                        <div className="w-full max-w-[85%] space-y-1">
                          <textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            rows={Math.min(
                              6,
                              Math.max(2, editingText.split('\n').length),
                            )}
                            className="w-full bg-black/30 border border-violet-400/40 rounded p-2 text-base sm:text-sm text-foreground focus:outline-none resize-none"
                          />
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={cancelEdit}
                              className="text-[10px] px-2 py-1 text-muted-foreground hover:text-foreground">
                              Cancel
                            </button>
                            <button
                              onClick={saveEditAndResend}
                              className="text-[10px] px-2 py-1 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/30 rounded text-violet-100">
                              Save & resend
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-foreground/10 rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[85%] relative">
                          <p className="text-sm whitespace-pre-wrap">
                            {m.content.split(/\n\n--- Attached: /)[0]}
                          </p>
                          {m.attachments && m.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {m.attachments.map((a) => (
                                <span
                                  key={a.id}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-foreground/70">
                                  📎 {a.name}
                                </span>
                              ))}
                            </div>
                          )}
                          {m.edited && (
                            <span className="text-[9px] text-muted-foreground/40 ml-1">
                              (edited)
                            </span>
                          )}
                          <button
                            onClick={() => startEdit(m)}
                            title="Edit & resend"
                            aria-label="Edit message"
                            className="absolute -left-7 top-2 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-muted-foreground/50 hover:text-foreground rounded transition-opacity">
                            <Pencil size={11} />
                          </button>
                        </div>
                      )}
                    </div>,
                  );
                  i++;
                  continue;
                }
                // assistant
                const reasoning =
                  m.reasoningSteps && m.reasoningSteps.length > 1;
                const reasoningKey = `r-${m.id}`;
                const reasoningCollapsed =
                  collapsedReasoning[reasoningKey] ?? true;
                out.push(
                  <div key={m.id} className="flex justify-start group">
                    <div className="rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[85%] space-y-2 w-full">
                      {reasoning && (
                        <div className="text-[10px]">
                          <button
                            onClick={() =>
                              setCollapsedReasoning((p) => ({
                                ...p,
                                [reasoningKey]: !reasoningCollapsed,
                              }))
                            }
                            className="flex items-center gap-1 text-muted-foreground/50 hover:text-muted-foreground/80">
                            {reasoningCollapsed ? (
                              <ChevronRight size={9} />
                            ) : (
                              <ChevronDown size={9} />
                            )}
                            Reasoning ({m.reasoningSteps?.length})
                          </button>
                          {!reasoningCollapsed && (
                            <div className="ml-3 mt-1 space-y-0.5 text-muted-foreground/70">
                              {m.reasoningSteps?.map((r, ri) => (
                                <div key={ri}>· {r.text}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {m.content.startsWith('__COMPARE__') ? (
                        <CompareBlock
                          payload={m.content.slice('__COMPARE__'.length).trim()}
                        />
                      ) : (
                        (() => {
                          const sections = m.content
                            .split(/\n-{3,}\n/)
                            .map((s) => s.trim())
                            .filter(Boolean);
                          if (sections.length <= 1)
                            return <MarkdownView text={m.content} />;
                          return (
                            <div className="space-y-2">
                              {sections.map((s, si) => (
                                <div
                                  key={si}
                                  className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2">
                                  <MarkdownView text={s} />
                                </div>
                              ))}
                            </div>
                          );
                        })()
                      )}
                      {/* Trace strip */}
                      {(m.node || m.latency) && (
                        <div className="flex flex-wrap gap-2 pt-1 items-center text-[10px] text-muted-foreground/60">
                          {m.node && (
                            <span className="text-violet-400/80">{m.node}</span>
                          )}
                          {m.tier && (
                            <span className="opacity-60">· {m.tier}</span>
                          )}
                          {m.model && (
                            <span className="font-mono opacity-60">
                              · {m.model}
                            </span>
                          )}
                          {m.latency && <span>· {m.latency}</span>}
                          {m.classifierLatency && (
                            <span>· cls {m.classifierLatency}</span>
                          )}
                          {m.totalTokens != null && m.totalTokens > 0 && (
                            <span className="font-mono">
                              · {m.promptTokens}→{m.completionTokens} (
                              {m.totalTokens} tok)
                            </span>
                          )}
                          <span className="ml-auto flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => copyToClipboard(m.content)}
                              title="Copy reply"
                              className="p-1 sm:p-0.5 hover:text-foreground">
                              <Copy size={10} />
                            </button>
                            <button
                              onClick={() => regenerate(m.id)}
                              title="Regenerate"
                              className="p-1 sm:p-0.5 hover:text-foreground">
                              <RefreshCw size={10} />
                            </button>
                            <button
                              onClick={() => regenerateOnRoute(m.id)}
                              title="Retry on different node…"
                              className="p-1 sm:p-0.5 hover:text-foreground">
                              <Cpu size={10} />
                            </button>
                            <button
                              onClick={() => branchFrom(m.id)}
                              title="Branch from here"
                              className="p-1 sm:p-0.5 hover:text-foreground">
                              <GitBranch size={10} />
                            </button>
                            <button
                              onClick={() =>
                                saveSnippet({
                                  title: active?.title || 'Reply',
                                  body: m.content,
                                  kind: 'reply',
                                })
                              }
                              title="Save as snippet"
                              className="p-1 sm:p-0.5 hover:text-foreground">
                              <Star size={10} />
                            </button>
                            <button
                              onClick={() => speak(m.content)}
                              title="Speak"
                              className="p-1 sm:p-0.5 hover:text-foreground">
                              <Volume2 size={10} />
                            </button>
                            <button
                              onClick={() =>
                                gotoPage('apps', { prompt: m.content })
                              }
                              title="Send to Apps wizard"
                              className="p-1 sm:p-0.5 hover:text-foreground">
                              <Blocks size={10} />
                            </button>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>,
                );
                i++;
              }
              return out;
            })()}
          </div>
        </div>

        {/* Scroll-to-bottom floating button */}
        {!atBottom && displayMessages.length > 3 && (
          <button
            onClick={() => {
              const el = messagesScrollRef.current;
              if (el) el.scrollTop = el.scrollHeight;
            }}
            title="Jump to latest"
            className="absolute bottom-28 right-6 p-2 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-200 hover:bg-violet-500/30 shadow-lg z-10 transition-colors">
            <ChevronDown size={14} />
          </button>
        )}

        {/* Status / slash menu / mention menu */}
        {statusMsg && (
          <div className="px-4 py-1 text-[11px] text-muted-foreground/70 border-t border-border/10 bg-white/[0.02] flex items-start gap-2 max-w-3xl mx-auto w-full">
            <span className="whitespace-pre-wrap flex-1">{statusMsg}</span>
            <button
              onClick={() => setStatusMsg(null)}
              className="text-muted-foreground/40 hover:text-foreground">
              <X size={11} />
            </button>
          </div>
        )}

        {/* Composer */}
        <div
          className="border-t border-border/20 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] relative">
          <div className="max-w-3xl mx-auto space-y-2">
            {/* Attachments preview */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {attachments.map((a) => (
                  <span
                    key={a.id}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-white/10 text-foreground/80">
                    📎 {a.name}
                    <button
                      onClick={() =>
                        setAttachments((p) => p.filter((x) => x.id !== a.id))
                      }
                      className="text-muted-foreground hover:text-red-300">
                      <X size={9} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Per-turn model override pill */}
            {pendingModel && !quickMode && (
              <div className="flex items-center gap-1 text-[10px]">
                <span className="text-muted-foreground/60">Next turn →</span>
                <span className="px-2 py-0.5 rounded bg-violet-500/15 border border-violet-400/30 text-violet-200">
                  {pendingModel}
                </span>
                <button
                  onClick={() => setPendingModel('')}
                  className="text-muted-foreground/60 hover:text-foreground">
                  <X size={10} />
                </button>
              </div>
            )}

            {/* Quick-mode pill */}
            {quickMode && (
              <div className="flex items-center gap-1 text-[10px]">
                <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-amber-200 flex items-center gap-1">
                  <Zap size={9} /> Quick: on (on-device ollama, simple chat)
                </span>
                <button
                  onClick={() => setQuickMode(false)}
                  className="text-muted-foreground/60 hover:text-foreground">
                  <X size={10} />
                </button>
              </div>
            )}

            {/* Tool-calling pill */}
            {toolsEnabled && (
              <div className="flex items-center gap-1 text-[10px]">
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-emerald-200">
                  tools: on
                </span>
                <button
                  onClick={() => setToolsEnabled(false)}
                  className="text-muted-foreground/60 hover:text-foreground">
                  <X size={10} />
                </button>
              </div>
            )}

            {/* Web-search pill */}
            {webEnabled && (
              <div className="flex items-center gap-1 text-[10px]">
                <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/30 text-sky-200">
                  🌐 web: on (next message will search the web)
                </span>
                <button
                  onClick={() => setWebEnabled(false)}
                  className="text-muted-foreground/60 hover:text-foreground">
                  <X size={10} />
                </button>
              </div>
            )}

            {/* Compare-mode pill */}
            {compareRoutes && (
              <div className="flex items-center gap-1 text-[10px]">
                <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-amber-200">
                  compare: {compareRoutes.join(' vs ')}
                </span>
                <button
                  onClick={() => setCompareRoutes(null)}
                  className="text-muted-foreground/60 hover:text-foreground">
                  <X size={10} />
                </button>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              {/* Toolbar row — kept separate so the Send button is always visible */}
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={onPickFiles}
                  title="Attach file"
                  disabled={loading}
                  className="p-1.5 text-muted-foreground/60 hover:text-foreground rounded hover:bg-white/5 disabled:opacity-30">
                  <Plus size={14} />
                </button>
                {micSupported && (
                  <button
                    onClick={() => (listening ? micStop() : micStart())}
                    title={listening ? 'Stop listening' : 'Voice input'}
                    className={`p-1.5 rounded hover:bg-white/5 ${listening ? 'text-red-400 animate-pulse' : 'text-muted-foreground/60 hover:text-foreground'}`}>
                    <Mic size={14} />
                  </button>
                )}
                <button
                  onClick={() => setWebEnabled((v) => !v)}
                  title={
                    webEnabled
                      ? 'Web search: ON for next message'
                      : 'Enable web search for next message'
                  }
                  disabled={loading || quickMode}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded text-[11px] hover:bg-white/5 disabled:opacity-30 transition-colors ${webEnabled ? 'text-sky-300 bg-sky-500/10 border border-sky-500/30' : 'text-muted-foreground/60 hover:text-foreground border border-transparent'}`}>
                  <Globe size={12} />
                  <span>Web</span>
                </button>
                <button
                  onClick={() => setQuickMode(!quickMode)}
                  title={
                    quickMode
                      ? 'Quick mode: ON — using on-device ollama, no tools/web'
                      : 'Quick mode — fast, simple replies on the on-device ollama (no tools, no web)'
                  }
                  disabled={loading}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded text-[11px] hover:bg-white/5 disabled:opacity-30 transition-colors ${quickMode ? 'text-amber-300 bg-amber-500/10 border border-amber-500/30' : 'text-muted-foreground/60 hover:text-foreground border border-transparent'}`}>
                  <Zap size={12} />
                  <span>Quick</span>
                </button>
                <select
                  value={pendingModel}
                  onChange={(e) => setPendingModel(e.target.value)}
                  title="Override route for next turn"
                  disabled={quickMode}
                  className="text-[10px] bg-black/30 border border-border/30 rounded px-1.5 py-1 text-muted-foreground/70 focus:outline-none focus:text-foreground disabled:opacity-30">
                  <option value="">auto</option>
                  <option value="local">local (ollama)</option>
                  <option value="light">light</option>
                  <option value="heavy">heavy</option>
                  {nodesList.map((n) => (
                    <option key={n.name} value={n.name}>
                      {n.name}
                    </option>
                  ))}
                </select>
                <div className="flex-1" />
                <span className="text-[9px] text-muted-foreground/40 hidden sm:inline">
                  ⌘↵ to send
                </span>
              </div>

              {/* Input row */}
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onPaste={onPasteCompose}
                  onKeyDown={(e) => {
                    if (
                      e.key === 'Enter' &&
                      !e.shiftKey &&
                      (e.metaKey || e.ctrlKey || !e.altKey)
                    ) {
                      if (!e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    } else if (e.key === 'ArrowUp' && !input && lastUserMsg) {
                      e.preventDefault();
                      startEdit(lastUserMsg);
                    } else if (
                      e.key === 'Tab' &&
                      mentionState &&
                      mentionState.items.length > 0
                    ) {
                      e.preventDefault();
                      insertMention(mentionState.items[0].name);
                    }
                  }}
                  placeholder={
                    loading
                      ? 'Generating… press Esc to stop'
                      : webEnabled
                        ? '🌐 Web is ON — your message will search the web first…'
                        : 'Message…   /  for commands,  @  to mention'
                  }
                  rows={1}
                  className="flex-1 min-w-0 bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none overflow-hidden"
                />
                {loading ? (
                  <Button
                    onClick={stop}
                    size="sm"
                    variant="destructive"
                    className="px-3 shrink-0"
                    title="Stop (Esc)">
                    <Square size={14} />
                  </Button>
                ) : (
                  <Button
                    onClick={send}
                    disabled={!input.trim() && attachments.length === 0}
                    size="sm"
                    className="px-3 shrink-0"
                    title="Send (⌘↵)">
                    <Send size={14} />
                  </Button>
                )}
              </div>
            </div>

            {/* Slash menu */}
            {showSlash && (
              <div className="absolute bottom-full left-3 right-3 mb-2 max-w-3xl mx-auto bg-[#0a0a0a] border border-white/10 rounded-lg shadow-xl overflow-hidden z-10">
                {SLASH_COMMANDS.filter(
                  (c) => c.cmd.startsWith(input.split(' ')[0]) || input === '/',
                ).map((c) => (
                  <button
                    key={c.cmd}
                    onClick={() => {
                      setInput(c.cmd + ' ');
                      setTimeout(() => inputRef.current?.focus(), 0);
                      setShowSlash(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-[11px] flex items-baseline gap-2">
                    <span className="font-mono text-violet-300">{c.cmd}</span>
                    <span className="text-muted-foreground/60">{c.hint}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Mention menu */}
            {mentionState && mentionState.items.length > 0 && (
              <div className="absolute bottom-full left-3 right-3 mb-2 max-w-3xl mx-auto bg-[#0a0a0a] border border-white/10 rounded-lg shadow-xl overflow-hidden z-10">
                {mentionState.items.map((it) => (
                  <button
                    key={`${it.kind}:${it.name}`}
                    onClick={() => insertMention(it.name)}
                    className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-[11px] flex items-center gap-2">
                    <span
                      className={`text-[9px] uppercase tracking-wider ${it.kind === 'app' ? 'text-blue-300/70' : 'text-amber-300/70'}`}>
                      {it.kind}
                    </span>
                    <span className="font-mono text-foreground">
                      @{it.name}
                    </span>
                    <span className="ml-auto text-[9px] text-muted-foreground/40">
                      ↹ Tab
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search palette */}
      {searchOpen && (
        <SearchPalette
          sessions={sessions}
          query={searchQ}
          setQuery={setSearchQ}
          onPick={(id) => {
            setActiveId(id);
            try {
              localStorage.setItem('chat-active', id);
            } catch {
              /* ignore */
            }
            setSearchOpen(false);
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* Schedules modal */}
      {schedulesOpen && (
        <SchedulesModal onClose={() => setSchedulesOpen(false)} />
      )}

      {/* Persona library trigger (subtle) */}
      <PersonaQuickAdd personas={personas} onSave={persistPersonas} />
    </div>
  );
}

/* ── Settings Panel (Config + Node CRUD) ── */
