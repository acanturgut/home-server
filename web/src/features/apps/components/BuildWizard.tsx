import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Layers,
  ListChecks,
  Loader2,
  Plus,
  Rocket,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { appsApi } from '@/features/apps/api';
import { TEMPLATES, assembleFinalPrompt } from '@/features/apps/templates';

type Step = 'draft' | 'review' | 'shape' | 'architect' | 'plan' | 'final';

type QType = 'single' | 'multi' | 'text' | 'scale';

interface ClarifyQ {
  id: string;
  question: string;
  hint?: string;
  type?: QType;
  suggestions?: string[];
  default?: string;
  required?: boolean;
}

interface PlanChunk {
  title: string;
  description: string;
  files?: string[];
}

interface Architecture {
  stack: string;
  models: { name: string; fields: string }[];
  endpoints: { method: string; path: string; purpose: string }[];
  components: { name: string; purpose: string }[];
  notes: string;
}

const emptyArchitecture: Architecture = {
  stack: '',
  models: [],
  endpoints: [],
  components: [],
  notes: '',
};

interface Props {
  /** Initial prompt the user typed in the panel. */
  initialPrompt: string;
  onClose: () => void;
  /** Final callback. The wizard hands off the assembled prompt and chosen name. */
  onBuild: (assembledPrompt: string, name: string) => void;
}

/**
 * Four-step app creation wizard:
 *   1. draft   – user's raw idea (editable)
 *   2. review  – AI-refined version (editable, can re-refine)
 *   3. shape   – pick templates + answer clarifying questions
 *   4. final   – preview the assembled prompt + pick name → Build
 */
export function BuildWizard({ initialPrompt, onClose, onBuild }: Props) {
  const [step, setStep] = useState<Step>('draft');

  // Step 1
  const [draft, setDraft] = useState(initialPrompt.trim());

  // Step 2
  const [refined, setRefined] = useState('');
  const [refining, setRefining] = useState(false);
  const [refineErr, setRefineErr] = useState<string | null>(null);
  const [refineSummary, setRefineSummary] = useState('');
  const [refineStartedAt, setRefineStartedAt] = useState<number | null>(null);
  const [refineMs, setRefineMs] = useState<number | null>(null);

  // Step 3
  const [templates, setTemplates] = useState<string[]>([]);
  const [questions, setQuestions] = useState<ClarifyQ[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [clarifying, setClarifying] = useState(false);
  const [clarifyErr, setClarifyErr] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [clarifyStartedAt, setClarifyStartedAt] = useState<number | null>(null);
  const [clarifyMs, setClarifyMs] = useState<number | null>(null);

  // Step 4 (plan)
  const [chunks, setChunks] = useState<PlanChunk[]>([]);
  const [planSummary, setPlanSummary] = useState('');
  const [planning, setPlanning] = useState(false);
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [planStartedAt, setPlanStartedAt] = useState<number | null>(null);
  const [planMs, setPlanMs] = useState<number | null>(null);

  // Step 4b (architect)
  const [architecture, setArchitecture] = useState<Architecture>(emptyArchitecture);
  const [archSummary, setArchSummary] = useState('');
  const [architecting, setArchitecting] = useState(false);
  const [archErr, setArchErr] = useState<string | null>(null);
  const [archStartedAt, setArchStartedAt] = useState<number | null>(null);
  const [archMs, setArchMs] = useState<number | null>(null);

  // Step 5
  const [finalPrompt, setFinalPrompt] = useState('');

  /* ─────────── helpers ─────────── */
  const runRefine = async (text: string) => {
    setRefining(true);
    setRefineErr(null);
    const t0 = Date.now();
    setRefineStartedAt(t0);
    setRefineMs(null);
    try {
      const res = await appsApi.refinePrompt(text);
      const rf = (res?.refined || '').trim();
      setRefined(rf || text);
      setRefineSummary(res?.summary || '');
      if (res?.parse_err && !rf) setRefineErr(res.parse_err);
    } catch (e) {
      setRefineErr((e as Error).message);
      setRefined(text);
    } finally {
      setRefining(false);
      setRefineMs(Date.now() - t0);
      setRefineStartedAt(null);
    }
  };

  const runClarify = async (text: string) => {
    setClarifying(true);
    setClarifyErr(null);
    const t0 = Date.now();
    setClarifyStartedAt(t0);
    setClarifyMs(null);
    try {
      const res = await appsApi.clarify(text);
      const qs = (res?.questions || []) as ClarifyQ[];
      setQuestions(qs);
      // Defaults from the LLM can come back in any shape — multi questions
      // often arrive as arrays, scale as numbers. The wizard stores answers
      // as strings (multi is comma-joined), so coerce here. Without this,
      // downstream code calls .trim() on the value and explodes with
      // "(...).trim is not a function".
      const toAnswer = (v: any): string => {
        if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).join(', ');
        if (v === null || v === undefined) return '';
        return String(v);
      };
      const defs: Record<string, string> = {};
      qs.forEach((q) => {
        const d = toAnswer((q as any).default);
        if (d) defs[q.id] = d;
      });
      setAnswers(defs);
      if (res?.suggestedName && !name) setName(res.suggestedName);
      if (qs.length === 0)
        setClarifyErr(res?.parse_err || 'No questions were returned.');
    } catch (e) {
      setClarifyErr((e as Error).message);
    } finally {
      setClarifying(false);
      setClarifyMs(Date.now() - t0);
      setClarifyStartedAt(null);
    }
  };

  /* ─────────── transitions ─────────── */
  const goReview = async () => {
    if (!draft.trim()) return;
    setStep('review');
    if (!refined) await runRefine(draft);
  };

  const goShape = async () => {
    setStep('shape');
    if (questions.length === 0) await runClarify(refined || draft);
  };

  const runArchitect = async (text: string) => {
    setArchitecting(true);
    setArchErr(null);
    const t0 = Date.now();
    setArchStartedAt(t0);
    setArchMs(null);
    try {
      const res = await appsApi.architectApp(text);
      setArchitecture({
        stack: res?.stack || '',
        models: (res?.models || []).map((m) => ({
          name: String(m.name || ''),
          fields: String(m.fields || ''),
        })),
        endpoints: (res?.endpoints || []).map((e) => ({
          method: String(e.method || 'GET').toUpperCase(),
          path: String(e.path || ''),
          purpose: String(e.purpose || ''),
        })),
        components: (res?.components || []).map((c) => ({
          name: String(c.name || ''),
          purpose: String(c.purpose || ''),
        })),
        notes: res?.notes || '',
      });
      setArchSummary(res?.summary || '');
      if (
        !res?.stack &&
        !(res?.models || []).length &&
        !(res?.endpoints || []).length &&
        !(res?.components || []).length
      )
        setArchErr(res?.parse_err || 'No architecture was returned.');
    } catch (e) {
      setArchErr((e as Error).message);
    } finally {
      setArchitecting(false);
      setArchMs(Date.now() - t0);
      setArchStartedAt(null);
    }
  };

  const goArchitect = async () => {
    setStep('architect');
    if (
      !architecture.stack &&
      architecture.models.length === 0 &&
      architecture.endpoints.length === 0 &&
      architecture.components.length === 0
    )
      await runArchitect(refined || draft);
  };

  const runPlan = async (text: string) => {
    setPlanning(true);
    setPlanErr(null);
    const t0 = Date.now();
    setPlanStartedAt(t0);
    setPlanMs(null);
    try {
      const res = await appsApi.planApp(text);
      const cs = (res?.chunks || []) as PlanChunk[];
      setChunks(cs);
      setPlanSummary(res?.summary || '');
      if (cs.length === 0)
        setPlanErr(res?.parse_err || 'No chunks were returned.');
    } catch (e) {
      setPlanErr((e as Error).message);
    } finally {
      setPlanning(false);
      setPlanMs(Date.now() - t0);
      setPlanStartedAt(null);
    }
  };

  const goPlan = async () => {
    setStep('plan');
    if (chunks.length === 0) {
      // Pass a slimmed architecture summary so chunks align with it.
      const archCtx: string[] = [];
      if (architecture.stack) archCtx.push(`Stack: ${architecture.stack}`);
      if (architecture.components.length)
        archCtx.push(
          'Components: ' +
            architecture.components.map((c) => c.name).join(', '),
        );
      if (architecture.endpoints.length)
        archCtx.push(
          'Endpoints: ' +
            architecture.endpoints
              .map((e) => `${e.method} ${e.path}`)
              .join(', '),
        );
      const seed =
        archCtx.length > 0
          ? `${refined || draft}\n\nKnown architecture:\n${archCtx.join('\n')}`
          : refined || draft;
      await runPlan(seed);
    }
  };

  const goFinal = () => {
    const fp = assembleFinalPrompt({
      refinedPrompt: refined || draft,
      templates,
      answers,
      questions: questions.map((q) => ({ id: q.id, question: q.question })),
      notes,
      chunks,
      architecture,
    });
    setFinalPrompt(fp);
    setStep('final');
  };

  const handleBuild = () => {
    onBuild(finalPrompt.trim(), name.trim());
  };

  /** Quick path: assemble the final prompt with current state and build immediately. */
  const skipAndBuild = () => {
    const fp = assembleFinalPrompt({
      refinedPrompt: refined || draft,
      templates,
      answers,
      questions: questions.map((q) => ({ id: q.id, question: q.question })),
      notes,
      chunks,
      architecture,
    });
    onBuild(fp.trim(), name.trim());
  };

  /* ─────────── render ─────────── */
  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-4xl h-full sm:h-auto sm:max-h-[92vh] flex flex-col rounded-none sm:rounded-2xl border-0 sm:border border-border/30 bg-background shadow-2xl">
        <Header step={step} onClose={onClose} />

        <div className="flex-1 overflow-auto px-6 py-5">
          {step === 'draft' && <DraftStep draft={draft} setDraft={setDraft} />}
          {step === 'review' && (
            <ReviewStep
              draft={draft}
              refined={refined}
              setRefined={setRefined}
              refining={refining}
              startedAt={refineStartedAt}
              elapsedMs={refineMs}
              error={refineErr}
              summary={refineSummary}
              onRefineAgain={() => runRefine(refined || draft)}
            />
          )}
          {step === 'shape' && (
            <ShapeStep
              loading={clarifying}
              startedAt={clarifyStartedAt}
              elapsedMs={clarifyMs}
              error={clarifyErr}
              questions={questions}
              answers={answers}
              setAnswers={setAnswers}
              templates={templates}
              setTemplates={setTemplates}
              notes={notes}
              setNotes={setNotes}
              name={name}
              setName={setName}
              onRegenerate={() => runClarify(refined || draft)}
            />
          )}
          {step === 'plan' && (
            <PlanStep
              loading={planning}
              startedAt={planStartedAt}
              elapsedMs={planMs}
              error={planErr}
              summary={planSummary}
              chunks={chunks}
              setChunks={setChunks}
              onRegenerate={() => runPlan(refined || draft)}
            />
          )}
          {step === 'architect' && (
            <ArchitectStep
              loading={architecting}
              startedAt={archStartedAt}
              elapsedMs={archMs}
              error={archErr}
              summary={archSummary}
              architecture={architecture}
              setArchitecture={setArchitecture}
              onRegenerate={() => runArchitect(refined || draft)}
            />
          )}
          {step === 'final' && (
            <FinalStep
              prompt={finalPrompt}
              setPrompt={setFinalPrompt}
              name={name}
              setName={setName}
            />
          )}
        </div>

        <Footer
          step={step}
          canForward={
            step === 'draft'
              ? !!draft.trim()
              : step === 'review'
                ? !!(refined || draft).trim() && !refining
                : step === 'shape'
                  ? !clarifying
                  : step === 'architect'
                    ? !architecting
                    : step === 'plan'
                      ? !planning
                      : !!finalPrompt.trim()
          }
          canSkip={
            (step === 'review' && !!(refined || draft).trim() && !refining) ||
            (step === 'shape' && !clarifying) ||
            (step === 'architect' && !architecting) ||
            (step === 'plan' && !planning)
          }
          onBack={() => {
            if (step === 'review') setStep('draft');
            else if (step === 'shape') setStep('review');
            else if (step === 'architect') setStep('shape');
            else if (step === 'plan') setStep('architect');
            else if (step === 'final') setStep('plan');
          }}
          onSkip={skipAndBuild}
          onForward={() => {
            if (step === 'draft') goReview();
            else if (step === 'review') goShape();
            else if (step === 'shape') goArchitect();
            else if (step === 'architect') goPlan();
            else if (step === 'plan') goFinal();
            else handleBuild();
          }}
        />
      </div>
    </div>
  );
}

/* ──────────────────────── header ──────────────────────── */
function Header({ step, onClose }: { step: Step; onClose: () => void }) {
  const STEPS: { id: Step; label: string }[] = [
    { id: 'draft', label: 'Idea' },
    { id: 'review', label: 'AI brief' },
    { id: 'shape', label: 'Shape' },
    { id: 'architect', label: 'Architect' },
    { id: 'plan', label: 'Plan' },
    { id: 'final', label: 'Build' },
  ];
  const idx = STEPS.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-border/15">
      <Sparkles size={14} className="text-primary/70" />
      <div className="flex items-center gap-1.5 text-xs">
        {STEPS.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <div key={s.id} className="flex items-center gap-1.5">
              <span
                className={`w-5 h-5 rounded-full grid place-items-center text-xs font-medium ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : done
                      ? 'bg-primary/30 text-foreground'
                      : 'bg-muted/30 text-muted-foreground/70'
                }`}>
                {done ? <Check size={10} /> : i + 1}
              </span>
              <span
                className={
                  active
                    ? 'text-foreground'
                    : done
                      ? 'text-muted-foreground/70'
                      : 'text-muted-foreground/65'
                }>
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <span className="text-muted-foreground/20 mx-1">›</span>
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={onClose}
        className="ml-auto p-1 text-muted-foreground/70 hover:text-foreground hover:bg-white/5 rounded">
        <X size={14} />
      </button>
    </div>
  );
}

/* ──────────────────────── footer ──────────────────────── */
function Footer({
  step,
  canForward,
  canSkip,
  onBack,
  onForward,
  onSkip,
}: {
  step: Step;
  canForward: boolean;
  canSkip: boolean;
  onBack: () => void;
  onForward: () => void;
  onSkip: () => void;
}) {
  const forwardLabel =
    step === 'draft'
      ? 'Refine with AI'
      : step === 'review'
        ? 'Looks good'
        : step === 'shape'
          ? 'Architect it'
          : step === 'architect'
            ? 'Plan the build'
            : step === 'plan'
              ? 'Preview brief'
              : 'Build app';
  return (
    <div className="flex items-center justify-between gap-2 px-6 py-3 border-t border-border/15">
      {step !== 'draft' ? (
        <button
          onClick={onBack}
          className="px-2.5 py-1.5 text-xs rounded-lg border border-border/25 text-muted-foreground/70 hover:bg-white/5 hover:text-foreground flex items-center gap-1.5">
          <ArrowLeft size={11} /> Back
        </button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        {canSkip && (
          <button
            onClick={onSkip}
            title="Use current answers and build now"
            className="px-2.5 py-1.5 text-xs rounded-lg border border-border/25 text-muted-foreground/70 hover:bg-white/5 hover:text-foreground flex items-center gap-1.5">
            <Zap size={11} /> Skip & build
          </button>
        )}
        <button
          onClick={onForward}
          disabled={!canForward}
          className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30 flex items-center gap-1.5">
          {step === 'final' ? <Rocket size={11} /> : null}
          {forwardLabel}
          {step !== 'final' && <ArrowRight size={11} />}
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────── steps ──────────────────────── */
function DraftStep({
  draft,
  setDraft,
}: {
  draft: string;
  setDraft: (v: string) => void;
}) {
  const charCount = draft.trim().length;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium">What do you want to build?</h3>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Write a sentence or two — the AI will sharpen it in the next step.
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-foreground/85">Your idea</label>
          <span className="text-xs text-muted-foreground/65 tabular-nums">
            {charCount} chars
          </span>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. A pomodoro timer with a leaderboard and dark theme."
          rows={7}
          autoFocus
          className="w-full text-sm bg-background/50 border border-border/30 rounded-lg px-3 py-2 focus:outline-none focus:border-border/60 resize-none leading-relaxed"
        />
        <p className="text-xs text-muted-foreground/70">
          Tip: include the main thing you want to see when you open it, and any
          must-have features. Don't worry about formatting.
        </p>
      </div>
    </div>
  );
}

function ReviewStep({
  draft,
  refined,
  setRefined,
  refining,
  startedAt,
  elapsedMs,
  error,
  summary,
  onRefineAgain,
}: {
  draft: string;
  refined: string;
  setRefined: (v: string) => void;
  refining: boolean;
  startedAt: number | null;
  elapsedMs: number | null;
  error: string | null;
  summary: string;
  onRefineAgain: () => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">AI-refined brief</h3>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          Edit anything that's wrong, then continue. You can re-refine as many
          times as you like.
          {!refining && elapsedMs != null && (
            <span className="ml-1 text-muted-foreground/65 tabular-nums">
              · refined in {fmtMs(elapsedMs)}
            </span>
          )}
        </p>
      </div>
      {summary && (
        <div className="text-xs text-muted-foreground/70 italic px-2 py-1.5 rounded bg-primary/5 border border-primary/15">
          “{summary}”
        </div>
      )}
      {refining ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground/60 py-8 justify-center">
          <Loader2 size={13} className="animate-spin" /> Rewriting your idea…
          <Elapsed startedAt={startedAt} className="text-muted-foreground/65 tabular-nums" />
        </div>
      ) : (
        <>
          <textarea
            value={refined || draft}
            onChange={(e) => setRefined(e.target.value)}
            rows={10}
            className="w-full text-sm bg-background/50 border border-border/30 rounded-lg px-3 py-2 focus:outline-none focus:border-border/60 resize-none font-mono leading-relaxed"
          />
          {error && (
            <div className="text-xs text-rose-300/80 px-2 py-1 rounded bg-rose-500/5 border border-rose-500/20">
              {error}
            </div>
          )}
          <button
            onClick={onRefineAgain}
            disabled={refining}
            className="px-2.5 py-1 text-xs rounded border border-border/25 text-muted-foreground/70 hover:bg-white/5 hover:text-foreground flex items-center gap-1.5">
            <Sparkles size={10} /> Refine again
          </button>
        </>
      )}
    </div>
  );
}

function ShapeStep({
  loading,
  startedAt,
  elapsedMs,
  error,
  questions,
  answers,
  setAnswers,
  templates,
  setTemplates,
  notes,
  setNotes,
  name,
  setName,
  onRegenerate,
}: {
  loading: boolean;
  startedAt: number | null;
  elapsedMs: number | null;
  error: string | null;
  questions: ClarifyQ[];
  answers: Record<string, string>;
  setAnswers: (v: Record<string, string>) => void;
  templates: string[];
  setTemplates: (v: string[]) => void;
  notes: string;
  setNotes: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  onRegenerate: () => void;
}) {
  const toggleTemplate = (id: string) =>
    setTemplates(
      templates.includes(id)
        ? templates.filter((t) => t !== id)
        : [...templates, id],
    );
  const setAnswer = (id: string, v: string) =>
    setAnswers({ ...answers, [id]: v });

  const toggleMulti = (id: string, value: string) => {
    const cur = (answers[id] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const next = cur.includes(value)
      ? cur.filter((s) => s !== value)
      : [...cur, value];
    setAnswer(id, next.join(', '));
  };

  const answeredCount = questions.filter((q) =>
    (answers[q.id] || '').trim() ? true : false,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-medium">Add features (optional)</h3>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Pre-built capabilities the AI will weave into your app.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          {TEMPLATES.map((t) => {
            const on = templates.includes(t.id);
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => toggleTemplate(t.id)}
                className={`text-left p-3 rounded-lg border flex items-start gap-2.5 transition-colors ${
                  on
                    ? 'border-primary/40 bg-primary/10'
                    : 'border-border/25 hover:border-border/50 hover:bg-white/5'
                }`}>
                <Icon
                  size={15}
                  className={
                    on
                      ? 'text-primary mt-0.5'
                      : 'text-muted-foreground/60 mt-0.5'
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium flex items-center gap-1.5">
                    {t.label}
                    {on && <Check size={10} className="text-primary" />}
                  </div>
                  <div className="text-xs text-muted-foreground/60 mt-0.5 leading-snug">
                    {t.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium">Tell the AI more</h3>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              The more you answer, the better the result. Defaults are
              pre-picked.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {questions.length > 0 && (
              <span className="text-xs text-muted-foreground/70 tabular-nums">
                {answeredCount} / {questions.length} answered
              </span>
            )}
            {!loading && elapsedMs != null && (
              <span className="text-xs text-muted-foreground/65 tabular-nums">
                · {fmtMs(elapsedMs)}
              </span>
            )}
            <button
              onClick={onRegenerate}
              disabled={loading}
              className="text-xs text-muted-foreground/60 hover:text-foreground flex items-center gap-1">
              <Sparkles size={10} /> Regenerate
            </button>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground/60 py-10 justify-center">
            <Loader2 size={14} className="animate-spin" /> Thinking up smart
            questions…
            <Elapsed startedAt={startedAt} className="text-muted-foreground/65 tabular-nums" />
          </div>
        ) : error ? (
          <div className="text-xs text-rose-300/80 px-2 py-1.5 rounded bg-rose-500/5 border border-rose-500/20 mt-3">
            {error}
          </div>
        ) : (
          <div className="space-y-2.5 mt-3">
            {questions.map((q) => {
              const isMulti = q.type === 'multi';
              const isText = q.type === 'text';
              const selectedSet = new Set(
                (answers[q.id] || '')
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              );
              return (
                <div
                  key={q.id}
                  className="rounded-lg border border-border/20 bg-white/2 px-3 py-2.5 space-y-2">
                  <div>
                    <label className="text-xs text-foreground/90 font-medium">
                      {q.question}
                      {q.required && (
                        <span className="text-rose-400/70 ml-0.5">*</span>
                      )}
                    </label>
                    {q.hint && (
                      <div className="text-xs text-muted-foreground/70 mt-0.5">
                        {q.hint}
                        {isMulti && ' · pick any'}
                      </div>
                    )}
                  </div>
                  {!isText && q.suggestions && q.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {q.suggestions.map((s) => {
                        const active = isMulti
                          ? selectedSet.has(s)
                          : answers[q.id] === s;
                        return (
                          <button
                            key={s}
                            onClick={() =>
                              isMulti
                                ? toggleMulti(q.id, s)
                                : setAnswer(q.id, s)
                            }
                            className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                              active
                                ? 'border-primary/50 bg-primary/15 text-foreground'
                                : 'border-border/25 text-muted-foreground/70 hover:bg-white/5 hover:text-foreground'
                            }`}>
                            {active && isMulti && (
                              <Check
                                size={9}
                                className="inline mr-0.5 -mt-0.5"
                              />
                            )}
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {!isMulti && (
                    <input
                      type="text"
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      placeholder={
                        isText ? 'Type your answer…' : 'or type your own answer'
                      }
                      className="w-full text-xs bg-background/50 border border-border/25 rounded px-2 py-1 focus:outline-none focus:border-border/60"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-foreground/85">
            App name{' '}
            <span className="text-muted-foreground/65">(kebab-case)</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) =>
              setName(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, '-')
                  .slice(0, 24),
              )
            }
            placeholder="my-cool-app"
            className="w-full text-xs bg-background/50 border border-border/30 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-border/60"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-foreground/85">
            Anything else?{' '}
            <span className="text-muted-foreground/65">(optional)</span>
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="extra constraints, design hints…"
            className="w-full text-xs bg-background/50 border border-border/30 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-border/60"
          />
        </div>
      </div>
    </div>
  );
}

function ArchitectStep({
  loading,
  startedAt,
  elapsedMs,
  error,
  summary,
  architecture,
  setArchitecture,
  onRegenerate,
}: {
  loading: boolean;
  startedAt: number | null;
  elapsedMs: number | null;
  error: string | null;
  summary: string;
  architecture: Architecture;
  setArchitecture: (v: Architecture) => void;
  onRegenerate: () => void;
}) {
  const updateField = <K extends keyof Architecture>(
    k: K,
    v: Architecture[K],
  ) => setArchitecture({ ...architecture, [k]: v });

  const updateModel = (
    i: number,
    patch: Partial<Architecture['models'][number]>,
  ) =>
    updateField(
      'models',
      architecture.models.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    );
  const updateEndpoint = (
    i: number,
    patch: Partial<Architecture['endpoints'][number]>,
  ) =>
    updateField(
      'endpoints',
      architecture.endpoints.map((e, idx) =>
        idx === i ? { ...e, ...patch } : e,
      ),
    );
  const updateComponent = (
    i: number,
    patch: Partial<Architecture['components'][number]>,
  ) =>
    updateField(
      'components',
      architecture.components.map((c, idx) =>
        idx === i ? { ...c, ...patch } : c,
      ),
    );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-medium flex items-center gap-1.5">
            <Layers size={14} className="text-primary/70" /> Architecture
          </h3>
          <p className="text-xs text-muted-foreground/60 mt-1">
            High-level shape — stack, data, endpoints, components. The Plan
            step uses this to decide the chunks.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!loading && elapsedMs != null && (
            <span className="text-xs text-muted-foreground/65 tabular-nums">
              · {fmtMs(elapsedMs)}
            </span>
          )}
          <button
            onClick={onRegenerate}
            disabled={loading}
            className="text-xs text-muted-foreground/60 hover:text-foreground flex items-center gap-1">
            <Sparkles size={10} /> Regenerate
          </button>
        </div>
      </div>

      {summary && !loading && (
        <div className="text-xs text-muted-foreground/70 italic px-2 py-1.5 rounded bg-primary/5 border border-primary/15">
          “{summary}”
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground/60 py-10 justify-center">
          <Loader2 size={14} className="animate-spin" /> Sketching the
          architecture…
          <Elapsed
            startedAt={startedAt}
            className="text-muted-foreground/65 tabular-nums"
          />
        </div>
      ) : error ? (
        <div className="text-xs text-rose-300/80 px-2 py-1.5 rounded bg-rose-500/5 border border-rose-500/20">
          {error}
        </div>
      ) : (
        <div className="space-y-4">
          <ArchSection title="Stack">
            <input
              type="text"
              value={architecture.stack}
              onChange={(e) => updateField('stack', e.target.value)}
              placeholder="React + Vite frontend, Express backend, SQLite"
              className="w-full text-xs bg-background/40 border border-border/15 rounded px-2 py-1 focus:outline-none focus:border-border/40"
            />
          </ArchSection>

          <ArchSection
            title="Data models"
            onAdd={() =>
              updateField('models', [
                ...architecture.models,
                { name: '', fields: '' },
              ])
            }
            empty={architecture.models.length === 0}
            emptyHint="No persistence — add a model if you need a database.">
            {architecture.models.map((m, i) => (
              <ArchRow
                key={i}
                onRemove={() =>
                  updateField(
                    'models',
                    architecture.models.filter((_, idx) => idx !== i),
                  )
                }>
                <input
                  type="text"
                  value={m.name}
                  onChange={(e) => updateModel(i, { name: e.target.value })}
                  placeholder="Model"
                  className="w-32 shrink-0 text-xs bg-background/40 border border-border/15 rounded px-2 py-1 focus:outline-none focus:border-border/40 font-medium"
                />
                <input
                  type="text"
                  value={m.fields}
                  onChange={(e) => updateModel(i, { fields: e.target.value })}
                  placeholder="id:int, title:string, …"
                  className="flex-1 text-xs font-mono bg-background/40 border border-border/15 rounded px-2 py-1 focus:outline-none focus:border-border/40 text-muted-foreground/80"
                />
              </ArchRow>
            ))}
          </ArchSection>

          <ArchSection
            title="API endpoints"
            onAdd={() =>
              updateField('endpoints', [
                ...architecture.endpoints,
                { method: 'GET', path: '', purpose: '' },
              ])
            }
            empty={architecture.endpoints.length === 0}
            emptyHint="Static-only app? Leave this empty.">
            {architecture.endpoints.map((e, i) => (
              <ArchRow
                key={i}
                onRemove={() =>
                  updateField(
                    'endpoints',
                    architecture.endpoints.filter((_, idx) => idx !== i),
                  )
                }>
                <select
                  value={e.method}
                  onChange={(ev) =>
                    updateEndpoint(i, { method: ev.target.value })
                  }
                  className="w-20 shrink-0 text-xs bg-background/40 border border-border/15 rounded px-1 py-1 focus:outline-none focus:border-border/40 font-mono">
                  {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={e.path}
                  onChange={(ev) => updateEndpoint(i, { path: ev.target.value })}
                  placeholder="/api/…"
                  className="w-44 shrink-0 text-xs font-mono bg-background/40 border border-border/15 rounded px-2 py-1 focus:outline-none focus:border-border/40"
                />
                <input
                  type="text"
                  value={e.purpose}
                  onChange={(ev) =>
                    updateEndpoint(i, { purpose: ev.target.value })
                  }
                  placeholder="purpose"
                  className="flex-1 text-xs bg-background/40 border border-border/15 rounded px-2 py-1 focus:outline-none focus:border-border/40"
                />
              </ArchRow>
            ))}
          </ArchSection>

          <ArchSection
            title="UI components"
            onAdd={() =>
              updateField('components', [
                ...architecture.components,
                { name: '', purpose: '' },
              ])
            }
            empty={architecture.components.length === 0}>
            {architecture.components.map((c, i) => (
              <ArchRow
                key={i}
                onRemove={() =>
                  updateField(
                    'components',
                    architecture.components.filter((_, idx) => idx !== i),
                  )
                }>
                <input
                  type="text"
                  value={c.name}
                  onChange={(e) => updateComponent(i, { name: e.target.value })}
                  placeholder="Component"
                  className="w-40 shrink-0 text-xs bg-background/40 border border-border/15 rounded px-2 py-1 focus:outline-none focus:border-border/40 font-medium"
                />
                <input
                  type="text"
                  value={c.purpose}
                  onChange={(e) =>
                    updateComponent(i, { purpose: e.target.value })
                  }
                  placeholder="purpose"
                  className="flex-1 text-xs bg-background/40 border border-border/15 rounded px-2 py-1 focus:outline-none focus:border-border/40"
                />
              </ArchRow>
            ))}
          </ArchSection>

          <ArchSection title="Cross-cutting notes">
            <textarea
              value={architecture.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={3}
              placeholder="state management, theming, polling vs SSE, auth model, trade-offs…"
              className="w-full text-xs bg-background/40 border border-border/15 rounded px-2 py-1 focus:outline-none focus:border-border/40 resize-none leading-snug"
            />
          </ArchSection>
        </div>
      )}
    </div>
  );
}

function ArchSection({
  title,
  children,
  onAdd,
  empty,
  emptyHint,
}: {
  title: string;
  children: React.ReactNode;
  onAdd?: () => void;
  empty?: boolean;
  emptyHint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground/70">
          {title}
        </span>
        {onAdd && (
          <button
            onClick={onAdd}
            className="text-xs text-muted-foreground/60 hover:text-foreground flex items-center gap-1">
            <Plus size={10} /> Add
          </button>
        )}
      </div>
      <div className="space-y-1.5">{children}</div>
      {empty && emptyHint && (
        <div className="text-xs text-muted-foreground/65 italic">
          {emptyHint}
        </div>
      )}
    </div>
  );
}

function ArchRow({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {children}
      <button
        onClick={onRemove}
        title="Remove"
        className="p-1 rounded text-rose-400/60 hover:text-rose-300 hover:bg-rose-500/10">
        <Trash2 size={10} />
      </button>
    </div>
  );
}

function PlanStep({
  loading,
  startedAt,
  elapsedMs,
  error,
  summary,
  chunks,
  setChunks,
  onRegenerate,
}: {
  loading: boolean;
  startedAt: number | null;
  elapsedMs: number | null;
  error: string | null;
  summary: string;
  chunks: PlanChunk[];
  setChunks: (v: PlanChunk[]) => void;
  onRegenerate: () => void;
}) {
  const updateChunk = (i: number, patch: Partial<PlanChunk>) =>
    setChunks(chunks.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const removeChunk = (i: number) =>
    setChunks(chunks.filter((_, idx) => idx !== i));
  const addChunk = () =>
    setChunks([...chunks, { title: '', description: '', files: [] }]);
  const moveChunk = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= chunks.length) return;
    const next = [...chunks];
    [next[i], next[j]] = [next[j], next[i]];
    setChunks(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-medium flex items-center gap-1.5">
            <ListChecks size={14} className="text-primary/70" /> Build plan
          </h3>
          <p className="text-xs text-muted-foreground/60 mt-1">
            The AI broke your app into ordered chunks. Edit, reorder, add or
            remove pieces — these will be sent to the builder so each chunk
            ships as one cohesive change.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!loading && elapsedMs != null && (
            <span className="text-xs text-muted-foreground/65 tabular-nums">
              · {fmtMs(elapsedMs)}
            </span>
          )}
          <button
            onClick={onRegenerate}
            disabled={loading}
            className="text-xs text-muted-foreground/60 hover:text-foreground flex items-center gap-1">
            <Sparkles size={10} /> Regenerate
          </button>
        </div>
      </div>
      {summary && !loading && (
        <div className="text-xs text-muted-foreground/70 italic px-2 py-1.5 rounded bg-primary/5 border border-primary/15">
          “{summary}”
        </div>
      )}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground/60 py-10 justify-center">
          <Loader2 size={14} className="animate-spin" /> Chunking your project…
          <Elapsed
            startedAt={startedAt}
            className="text-muted-foreground/65 tabular-nums"
          />
        </div>
      ) : error ? (
        <div className="text-xs text-rose-300/80 px-2 py-1.5 rounded bg-rose-500/5 border border-rose-500/20">
          {error}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {chunks.map((c, i) => (
              <div
                key={i}
                className="rounded-lg border border-border/20 bg-white/2 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs grid place-items-center shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  <input
                    type="text"
                    value={c.title}
                    onChange={(e) => updateChunk(i, { title: e.target.value })}
                    placeholder="Chunk title"
                    className="flex-1 text-xs bg-transparent border-b border-border/15 px-1 py-0.5 focus:outline-none focus:border-border/40"
                  />
                  <button
                    onClick={() => moveChunk(i, -1)}
                    disabled={i === 0}
                    title="Move up"
                    className="text-xs px-1.5 py-0.5 rounded text-muted-foreground/70 hover:text-foreground hover:bg-white/5 disabled:opacity-20">
                    ↑
                  </button>
                  <button
                    onClick={() => moveChunk(i, 1)}
                    disabled={i === chunks.length - 1}
                    title="Move down"
                    className="text-xs px-1.5 py-0.5 rounded text-muted-foreground/70 hover:text-foreground hover:bg-white/5 disabled:opacity-20">
                    ↓
                  </button>
                  <button
                    onClick={() => removeChunk(i)}
                    title="Remove chunk"
                    className="p-1 rounded text-rose-400/60 hover:text-rose-300 hover:bg-rose-500/10">
                    <Trash2 size={10} />
                  </button>
                </div>
                <textarea
                  value={c.description}
                  onChange={(e) =>
                    updateChunk(i, { description: e.target.value })
                  }
                  rows={2}
                  placeholder="What this chunk delivers (screens, endpoints, data)…"
                  className="w-full text-xs bg-background/40 border border-border/15 rounded px-2 py-1 focus:outline-none focus:border-border/40 resize-none leading-snug"
                />
                <input
                  type="text"
                  value={(c.files || []).join(', ')}
                  onChange={(e) =>
                    updateChunk(i, {
                      files: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="files (comma separated, optional)"
                  className="w-full text-xs font-mono bg-background/40 border border-border/15 rounded px-2 py-1 focus:outline-none focus:border-border/40 text-muted-foreground/80"
                />
              </div>
            ))}
          </div>
          <button
            onClick={addChunk}
            className="px-2.5 py-1 text-xs rounded border border-dashed border-border/30 text-muted-foreground/70 hover:bg-white/5 hover:text-foreground flex items-center gap-1.5">
            <Plus size={11} /> Add chunk
          </button>
        </>
      )}
    </div>
  );
}

function FinalStep({
  prompt,
  setPrompt,
  name,
  setName,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  name: string;
  setName: (v: string) => void;
}) {
  const wordCount = useMemo(
    () => prompt.trim().split(/\s+/).filter(Boolean).length,
    [prompt],
  );
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Final brief</h3>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          This is what the AI will receive. Edit if anything looks off, then
          press Build.
        </p>
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={16}
        className="w-full text-xs bg-background/50 border border-border/30 rounded-lg px-3 py-2 focus:outline-none focus:border-border/60 resize-none font-mono leading-relaxed"
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <label className="text-xs text-muted-foreground/60 shrink-0">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) =>
              setName(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, '-')
                  .slice(0, 24),
              )
            }
            placeholder="my-cool-app"
            className="flex-1 text-xs bg-background/50 border border-border/30 rounded px-2 py-1 focus:outline-none focus:border-border/60"
          />
        </div>
        <span className="text-xs text-muted-foreground/65 tabular-nums">
          {wordCount} words
        </span>
      </div>
    </div>
  );
}

/** Formats a millisecond duration as "1.2s" / "12s" / "1m 04s". */
function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}m ${String(r).padStart(2, '0')}s`;
}

/** Live-ticking elapsed-time label. Re-renders every 250ms while
 * `startedAt` is set, so the user sees long AI calls progressing. */
function Elapsed({
  startedAt,
  className,
}: {
  startedAt: number | null;
  className?: string;
}) {
  const [, force] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (startedAt == null) return;
    ref.current = setInterval(() => force((n) => n + 1), 250);
    return () => {
      if (ref.current) clearInterval(ref.current);
      ref.current = null;
    };
  }, [startedAt]);
  if (startedAt == null) return null;
  return <span className={className}>{fmtMs(Date.now() - startedAt)}</span>;
}
