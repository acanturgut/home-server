import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Editable system-prompt definition: label, blurb, and supported variables. */
export const PROMPT_META: Record<
  string,
  { label: string; desc: string; vars: string }
> = {
  build: {
    label: 'Build (New App)',
    desc: 'Base system prompt sent to aider when creating a new app. Defines the scaffold, rules, and coding conventions.',
    vars: 'No template variables — appended with the user prompt and port.',
  },
  rebuild: {
    label: 'Rebuild (Change Request)',
    desc: 'Sent to aider when applying changes to an existing app.',
    vars: "{{change}} — the user's change request, {{port}} — the app port.",
  },
  fix: {
    label: 'Fix (With User Report)',
    desc: 'Sent to aider when fixing errors with a user-provided description.',
    vars: '{{description}} — user report, {{logs}} — container logs, {{port}} — the app port.',
  },
  fixAuto: {
    label: 'Fix (Auto)',
    desc: 'Sent to aider when auto-fixing errors without a user description.',
    vars: '{{logs}} — container logs, {{port}} — the app port.',
  },
  clarify: {
    label: 'Clarify (AI Wizard)',
    desc: 'Sent to the planner LLM (Claude or LM Studio) to generate clarifying questions before a new app is built. Must instruct the model to return strict JSON.',
    vars: '{{prompt}} — the original user idea.',
  },
};

/** Settings panel sub-component for editing the aider/build prompt set. */
export function PromptsEditor({
  prompts,
  onLoad,
  onChange,
  onSave,
  onReset,
  saving,
  dirty,
}: {
  prompts: Record<string, string>;
  onLoad: () => void;
  onChange: (key: string, val: string) => void;
  onSave: () => void;
  onReset: () => void;
  saving: boolean;
  dirty: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    onLoad();
  }, [onLoad]);

  const keys = Object.keys(PROMPT_META);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground/80">
            System Prompts
          </h3>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            Edit the prompts sent to aider during build, rebuild, and fix
            phases. Use template variables like {'{{port}}'} that get replaced
            at runtime.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onReset}
            disabled={saving}
            className="px-3 py-1.5 text-xs text-muted-foreground/70 hover:text-foreground/70 border border-border/20 rounded-md hover:bg-muted/20 transition-colors disabled:opacity-30">
            Reset Defaults
          </button>
          <button
            onClick={onSave}
            disabled={saving || !dirty}
            className="px-3 py-1.5 text-xs text-foreground/80 bg-foreground/10 hover:bg-foreground/15 rounded-md transition-colors disabled:opacity-30">
            {saving ? 'Saving...' : dirty ? 'Save Changes' : 'Saved'}
          </button>
        </div>
      </div>

      {keys.map((key) => {
        const meta = PROMPT_META[key];
        const isOpen = expanded === key;
        const value = prompts[key] || '';
        const lines = value.split('\n').length;
        return (
          <div
            key={key}
            className="rounded-lg border border-border/20 overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : key)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/10 transition-colors text-left">
              <div>
                <span className="text-sm font-medium text-foreground/70">
                  {meta.label}
                </span>
                <p className="text-xs text-muted-foreground/65 mt-0.5">
                  {meta.desc}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground/30 tabular-nums">
                  {lines} lines
                </span>
                <ChevronDown
                  size={14}
                  className={`text-muted-foreground/30 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-border/10 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground/30">
                  <span>Variables:</span>
                  <code className="bg-muted/20 px-1.5 py-0.5 rounded">
                    {meta.vars}
                  </code>
                </div>
                <textarea
                  value={value}
                  onChange={(e) => onChange(key, e.target.value)}
                  rows={Math.min(Math.max(lines + 2, 8), 30)}
                  spellCheck={false}
                  className="w-full bg-black/20 text-xs font-mono text-foreground/70 leading-relaxed p-3 rounded-md border border-border/10 focus:outline-none focus:border-foreground/20 resize-y"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
