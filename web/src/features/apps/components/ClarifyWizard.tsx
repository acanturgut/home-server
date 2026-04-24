import React from 'react';
import { Sparkles, X, AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Modal that interviews the user about a half-formed app idea: re-runs AI
 * clarification, lets them edit the suggested app name, and gathers answers
 * to dynamic questions before kicking off the build.
 */
export function ClarifyWizard(props: {
  prompt: string;
  setPrompt: (v: string) => void;
  loading: boolean;
  error: string | null;
  summary: string;
  questions: Array<{
    id: string;
    question: string;
    hint?: string;
    suggestions?: string[];
    required?: boolean;
    default?: string;
  }>;
  answers: Record<string, string>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  name: string;
  setName: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  onClose: () => void;
  onRegenerate: () => void;
  onSkip: () => void;
  onBuild: () => void;
}) {
  const {
    prompt,
    setPrompt,
    loading,
    error,
    summary,
    questions,
    answers,
    setAnswers,
    name,
    setName,
    notes,
    setNotes,
    onClose,
    onRegenerate,
    onSkip,
    onBuild,
  } = props;
  const setAns = (id: string, v: string) =>
    setAnswers((prev) => ({ ...prev, [id]: v }));
  const answeredCount = questions.filter((q) =>
    (answers[q.id] || '').trim(),
  ).length;
  const requiredMissing = questions.some(
    (q) => q.required && !(answers[q.id] || '').trim(),
  );
  const sanitizeName = (v: string) =>
    v
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 24);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[640px] max-w-[92vw] max-h-[88vh] flex flex-col bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-violet-400" />
            <h3 className="text-[12px] font-medium text-foreground/90">
              Refine your app idea
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-muted-foreground/50 hover:text-foreground transition-colors">
            <X size={12} />
          </button>
        </div>

        {/* Original prompt — editable */}
        <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40">
              Your idea
            </div>
            <button
              onClick={onRegenerate}
              disabled={loading || !prompt.trim()}
              title="Re-run AI clarification on the current idea"
              className="text-[9px] text-violet-400/70 hover:text-violet-300 disabled:opacity-30 transition-colors flex items-center gap-1">
              <Sparkles size={9} className={loading ? 'animate-pulse' : ''} />
              {loading
                ? 'Refining…'
                : questions.length
                  ? 'Re-refine'
                  : 'Refine with AI'}
            </button>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (prompt.trim()) onRegenerate();
              }
            }}
            placeholder="Describe what you want to build… e.g. a kanban board with drag-and-drop, dark theme"
            rows={3}
            autoFocus
            className="w-full bg-transparent border border-white/5 rounded p-2 text-[12px] text-foreground/90 placeholder:text-muted-foreground/30 focus:outline-none focus:border-violet-500/30 resize-none"
          />
          {summary && (
            <div className="mt-2 pt-2 border-t border-white/5">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 mb-1">
                AI understands
              </div>
              <p className="text-[11px] text-violet-300/80 leading-relaxed">
                {summary}
              </p>
            </div>
          )}
          {!loading && (
            <div className="mt-2 pt-2 border-t border-white/5">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles size={9} className="text-violet-400/60" />
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40">
                  Suggested name
                </div>
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(sanitizeName(e.target.value))}
                placeholder="my-app"
                spellCheck={false}
                className="w-full bg-black/30 border border-white/5 rounded px-2 py-1.5 text-[11px] font-mono text-violet-200/90 placeholder:text-muted-foreground/30 focus:outline-none focus:border-violet-400/40 transition-colors"
              />
              <p className="text-[10px] text-muted-foreground/40 mt-1">
                Lowercase, dashes only. Used as the app folder & container name.
              </p>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-4 py-3">
          {loading && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Sparkles
                size={24}
                className="text-violet-400/60 animate-pulse"
              />
              <p className="text-[11px] text-muted-foreground/60">
                Thinking up the right questions...
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-3 py-6">
              <AlertCircle size={20} className="text-amber-400/70" />
              <p className="text-[11px] text-amber-300/80 text-center max-w-sm">
                {error}
              </p>
              <button
                onClick={onRegenerate}
                className="text-[10px] px-3 py-1 bg-white/[0.04] hover:bg-white/[0.08] rounded text-muted-foreground/70 hover:text-foreground transition-colors">
                Try again
              </button>
            </div>
          )}

          {!loading && !error && questions.length > 0 && (
            <div className="space-y-4">
              {questions.map((q, i) => (
                <div key={q.id} className="space-y-1.5">
                  <label className="block text-[11px] text-foreground/80">
                    <span className="text-muted-foreground/40 mr-1.5">
                      {i + 1}.
                    </span>
                    {q.question}
                    {q.required && (
                      <span className="text-red-400/70 ml-1">*</span>
                    )}
                  </label>
                  {q.hint && (
                    <p className="text-[10px] text-muted-foreground/40 ml-4">
                      {q.hint}
                    </p>
                  )}
                  <input
                    type="text"
                    value={answers[q.id] || ''}
                    onChange={(e) => setAns(q.id, e.target.value)}
                    placeholder="Your answer..."
                    className="ml-4 w-[calc(100%-1rem)] bg-black/30 border border-white/5 rounded px-2 py-1.5 text-[11px] text-foreground/90 placeholder:text-muted-foreground/30 focus:outline-none focus:border-violet-400/40 transition-colors"
                  />
                  {q.suggestions && q.suggestions.length > 0 && (
                    <div className="ml-4 flex flex-wrap gap-1.5 pt-0.5">
                      {q.suggestions.map((s) => {
                        const active = (answers[q.id] || '') === s;
                        return (
                          <button
                            key={s}
                            onClick={() => setAns(q.id, s)}
                            className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                              active
                                ? 'bg-violet-500/15 border-violet-400/40 text-violet-200'
                                : 'bg-white/[0.02] border-white/5 text-muted-foreground/60 hover:text-foreground/80 hover:border-white/15'
                            }`}>
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && !error && (
            <div className="mt-5 pt-4 border-t border-white/5 space-y-1.5">
              <label className="block text-[11px] text-foreground/80">
                Anything else?{' '}
                <span className="text-muted-foreground/40">(optional)</span>
              </label>
              <p className="text-[10px] text-muted-foreground/40">
                Extra context, design hints, libraries to use, things to avoid…
              </p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="e.g. keep it minimalist, use Tailwind, prefer SQLite over Postgres…"
                className="w-full bg-black/30 border border-white/5 rounded px-2 py-1.5 text-[11px] text-foreground/90 placeholder:text-muted-foreground/30 focus:outline-none focus:border-violet-400/40 transition-colors resize-none"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-white/5 bg-white/[0.01]">
          <div className="flex items-center gap-2">
            <button
              onClick={onRegenerate}
              disabled={loading || !prompt.trim()}
              className="text-[10px] flex items-center gap-1 px-2 py-1 text-muted-foreground/50 hover:text-foreground/80 disabled:opacity-30 transition-colors">
              <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
              Regenerate
            </button>
            {!loading && questions.length > 0 && (
              <span className="text-[9px] text-muted-foreground/40">
                {answeredCount}/{questions.length} answered
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onSkip}
              disabled={!prompt.trim()}
              className="text-[10px] px-3 py-1.5 text-muted-foreground/60 hover:text-foreground disabled:opacity-30 transition-colors">
              Skip & build
            </button>
            <button
              onClick={onBuild}
              disabled={loading || requiredMissing || !prompt.trim()}
              className="text-[11px] px-3 py-1.5 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/30 rounded text-violet-100 disabled:opacity-30 transition-colors flex items-center gap-1.5">
              <Sparkles size={11} />
              Build app
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
