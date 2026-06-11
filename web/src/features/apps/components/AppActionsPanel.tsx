import { useState } from 'react';
import {
  AlertCircle,
  Blocks,
  Bug,
  ExternalLink,
  MessageSquarePlus,
  Play,
  Rocket,
  RotateCw,
  StopCircle,
  Trash2,
  Wrench,
} from 'lucide-react';
import { API_BASE } from '@/lib/api';
import type { AppInfo } from '@/lib/types';
import { guessIcon } from '@/lib/icons';

export interface AppActionsPanelProps {
  app: AppInfo | null | undefined;
  /** Header label (e.g. "App"). */
  title?: string;
  /** Show a small "live" pulse in header (deploy/build in flight). */
  busy?: boolean;
  onOpen?: () => void;
  onRestart?: () => void;
  onStop?: () => void;
  onDelete?: () => void;
  onRedeploy?: () => void;
  onAutoFix?: () => void;
  onFeature?: () => void;
  onFix?: () => void;
  onBug?: () => void;
}

/** Shared right-rail panel: identity, status, prompt, error and the
 *  full action toolbar for the selected app. Used by both the Simple
 *  and Expert apps panels. */
export function AppActionsPanel({
  app,
  title = 'App',
  busy,
  onOpen,
  onRestart,
  onStop,
  onDelete,
  onRedeploy,
  onAutoFix,
  onFeature,
  onFix,
  onBug,
}: AppActionsPanelProps) {
  const [descExpanded, setDescExpanded] = useState(false);

  if (!app) {
    return (
      <div className="h-full flex flex-col">
        <PanelHeader title={title} busy={busy} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground/30">
            No app selected
          </p>
        </div>
      </div>
    );
  }

  const isRunning = app.status === 'running';
  const isBuilding = app.status === 'building';
  const isFailed = app.status === 'failed';
  const dotColor = isRunning
    ? 'bg-emerald-500'
    : isBuilding
      ? 'bg-amber-500 animate-pulse'
      : isFailed
        ? 'bg-red-500'
        : 'bg-zinc-500';

  const openHref = `${API_BASE}${app.route || `/apps/${app.name}/`}`;

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={title} busy={busy} />
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {/* Identity */}
        <div className="flex items-center gap-3 p-2 rounded-lg bg-white/2 border border-border/10">
          <span className="text-2xl">{app.icon || guessIcon(app.name)}</span>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold truncate">{app.name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
              <span className="text-xs text-muted-foreground/60 capitalize">
                {app.status}
              </span>
              <span className="text-xs text-muted-foreground/30">
                :{app.port}
              </span>
            </div>
          </div>
        </div>

        {/* Prompt */}
        {app.prompt && (
          <div className="px-1">
            <p
              className={`text-xs text-muted-foreground/60 leading-relaxed whitespace-pre-wrap ${descExpanded ? '' : 'line-clamp-3'}`}>
              {app.prompt}
            </p>
            {app.prompt.length > 140 && (
              <button
                onClick={() => setDescExpanded((v) => !v)}
                className="mt-1 text-xs uppercase tracking-wider text-muted-foreground/65 hover:text-muted-foreground/70">
                {descExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

        {/* Error */}
        {app.error && (
          <div className="p-2.5 bg-red-500/5 border border-red-500/15 rounded-lg">
            <div className="text-xs uppercase tracking-wider text-red-400/60 mb-1 flex items-center gap-1.5">
              <AlertCircle size={9} /> Error
            </div>
            <p className="text-xs text-red-400/70 font-mono whitespace-pre-wrap line-clamp-6">
              {app.error}
            </p>
          </div>
        )}

        {/* Actions */}
        <AppActions
          app={app}
          openHref={openHref}
          onOpen={onOpen}
          onRestart={onRestart}
          onStop={onStop}
          onDelete={onDelete}
          onRedeploy={onRedeploy}
          onAutoFix={onAutoFix}
          onFeature={onFeature}
          onFix={onFix}
          onBug={onBug}
        />
      </div>
    </div>
  );
}

/** Just the action button stack — reused inside Expert's right rail
 *  so it sits above Resources/History without duplicating identity. */
export function AppActions({
  app,
  openHref,
  onOpen,
  onRestart,
  onStop,
  onDelete,
  onRedeploy,
  onAutoFix,
  onFeature,
  onFix,
  onBug,
}: {
  app: AppInfo;
  openHref?: string;
  onOpen?: () => void;
  onRestart?: () => void;
  onStop?: () => void;
  onDelete?: () => void;
  onRedeploy?: () => void;
  onAutoFix?: () => void;
  onFeature?: () => void;
  onFix?: () => void;
  onBug?: () => void;
}) {
  const isRunning = app.status === 'running';
  const isBuilding = app.status === 'building';
  const isFailed = app.status === 'failed';
  const isStopped = app.status === 'stopped';
  const href = openHref ?? `${API_BASE}${app.route || `/apps/${app.name}/`}`;

  return (
    <div className="space-y-1.5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground/65 px-1 flex items-center gap-1.5">
        <Blocks size={9} /> Actions
      </div>

      {isRunning && onOpen && (
        <ActionRow
          onClick={onOpen}
          icon={<ExternalLink size={11} />}
          label="Open"
          tone="emerald"
          hint="Open the app in a new tab"
          href={href}
        />
      )}

      {onFeature && (
        <ActionRow
          onClick={onFeature}
          icon={<MessageSquarePlus size={11} />}
          label="Feature request"
          tone="violet"
          hint="Describe a change for the AI to implement"
          disabled={isBuilding}
        />
      )}
      {onFix && (
        <ActionRow
          onClick={onFix}
          icon={<Wrench size={11} />}
          label="Fix"
          tone="amber"
          hint="Describe what isn't working — AI patches it"
          disabled={isBuilding}
        />
      )}
      {onBug && (
        <ActionRow
          onClick={onBug}
          icon={<Bug size={11} />}
          label="Bug report"
          tone="rose"
          hint="What you saw vs. what you expected — AI diagnoses"
          disabled={isBuilding}
        />
      )}
      {(isFailed || isStopped) && onAutoFix && (
        <ActionRow
          onClick={onAutoFix}
          icon={<Wrench size={11} />}
          label="Auto-fix from logs"
          tone="amber"
          hint="No description — AI inspects logs and patches"
          disabled={isBuilding}
        />
      )}

      {onRedeploy && (
        <ActionRow
          onClick={onRedeploy}
          icon={<Rocket size={11} />}
          label="Redeploy"
          tone="sky"
          hint="Rebuild Docker image from current files (no AI)"
          disabled={isBuilding}
        />
      )}
      {(isRunning || isFailed || isStopped) && onRestart && (
        <ActionRow
          onClick={onRestart}
          icon={<RotateCw size={11} />}
          label="Restart container"
          tone="muted"
          hint="Fast restart — no rebuild"
          disabled={isBuilding}
        />
      )}
      {!isRunning && !isBuilding && !isFailed && onRestart && (
        <ActionRow
          onClick={onRestart}
          icon={<Play size={11} />}
          label="Start"
          tone="emerald"
          hint="Start the container"
        />
      )}
      {isRunning && onStop && (
        <ActionRow
          onClick={onStop}
          icon={<StopCircle size={11} />}
          label="Stop"
          tone="muted"
          hint="Stop the container"
        />
      )}

      {onDelete && (
        <ActionRow
          onClick={onDelete}
          icon={<Trash2 size={11} />}
          label="Delete app"
          tone="rose"
          hint={
            isBuilding
              ? 'Cancels the running build, removes container & files'
              : 'Removes container and all files'
          }
        />
      )}
    </div>
  );
}

function PanelHeader({ title, busy }: { title: string; busy?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 h-8 px-3 border-b border-border/10 shrink-0 text-xs uppercase tracking-wider text-muted-foreground/65">
      <Blocks size={11} />
      {title}
      {busy && (
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
      )}
    </div>
  );
}

type Tone = 'emerald' | 'violet' | 'amber' | 'rose' | 'sky' | 'muted';

const TONE_CLASSES: Record<Tone, string> = {
  emerald: 'border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/10',
  violet: 'border-violet-500/25 text-violet-300 hover:bg-violet-500/10',
  amber: 'border-amber-500/25 text-amber-300 hover:bg-amber-500/10',
  rose: 'border-rose-500/25 text-rose-300 hover:bg-rose-500/10',
  sky: 'border-sky-500/25 text-sky-300 hover:bg-sky-500/10',
  muted:
    'border-border/25 text-muted-foreground/70 hover:bg-white/5 hover:text-foreground',
};

function ActionRow({
  onClick,
  icon,
  label,
  hint,
  tone = 'muted',
  disabled,
  href,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  tone?: Tone;
  disabled?: boolean;
  href?: string;
}) {
  const cls = `w-full text-left px-2.5 py-1.5 rounded-lg border ${TONE_CLASSES[tone]} disabled:opacity-30 transition-colors flex items-center gap-2 group`;
  const inner = (
    <>
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-medium truncate">{label}</span>
        {hint && (
          <span className="block text-xs text-muted-foreground/65 truncate">
            {hint}
          </span>
        )}
      </span>
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={cls}
        title={hint}>
        {inner}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={cls}>
      {inner}
    </button>
  );
}
