import { useState, useEffect } from 'react';
import { Activity, Cpu, HardDrive, Thermometer } from 'lucide-react';
import { appsApi } from '@/features/apps/api';
import { fmtTime } from '@/lib/format';
import type { BuildEvent } from '@/lib/types';

/** Pipeline step ordering used by `PipelineProgress`. */
export const PIPELINE_STEPS = [
  'planning',
  'task',
  'merging',
  'validating',
  'deploying',
  'done',
] as const;

/** Human labels for build pipeline steps. */
export const STEP_LABELS: Record<string, string> = {
  planning: 'Plan',
  task: 'Tasks',
  validating: 'Validate',
  deploying: 'Deploy',
  'hot-reload': '⚡ Hot',
  done: 'Done',
  error: 'Error',
};

/** Tailwind colour utility classes per build step. */
export const STEP_COLORS: Record<string, string> = {
  planning: 'text-violet-400',
  task: 'text-cyan-400',
  validating: 'text-orange-400',
  deploying: 'text-emerald-400',
  'hot-reload': 'text-amber-400 font-semibold',
  done: 'text-green-400',
  error: 'text-red-400',
};

/** Live GPU/VRAM/temp readout for nodes participating in an in-flight build. */
export function BuildNodeStats({ building }: { building: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stats, setStats] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!building) return;
    const poll = () => {
      appsApi.nodeStats().then((s) => setStats(s || {}));
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [building]);

  if (!building) return null;
  const entries = Object.values(stats).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: any) =>
      s.gpu_name &&
      new Date().getTime() - new Date(s.last_seen).getTime() < 30000,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any[];
  if (entries.length === 0) return null;

  return (
    <div className="px-3 py-1.5 border-b border-border/10 space-y-1.5">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {entries.map((s: any) => {
        const gpuMemPct = s.gpu_mem_total_mb
          ? Math.round((s.gpu_mem_used_mb / s.gpu_mem_total_mb) * 100)
          : 0;
        return (
          <div key={s.node_id} className="space-y-1">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
              <Activity size={10} className="shrink-0" />
              <span className="font-medium text-foreground/50">
                {s.hostname || s.node_id}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground/40 truncate">
                {s.gpu_name}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[9px]">
              <div className="flex items-center gap-1.5">
                <Cpu size={9} className="text-blue-400/60 shrink-0" />
                <span className="text-muted-foreground/50">GPU</span>
                <div className="flex-1 h-1 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${s.gpu_usage || 0}%` }}
                  />
                </div>
                <span className="tabular-nums text-foreground/50 w-6 text-right">
                  {s.gpu_usage || 0}%
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <HardDrive size={9} className="text-purple-400/60 shrink-0" />
                <span className="text-muted-foreground/50">VRAM</span>
                <div className="flex-1 h-1 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-purple-500 transition-all"
                    style={{ width: `${gpuMemPct}%` }}
                  />
                </div>
                <span className="tabular-nums text-foreground/50 w-12 text-right">
                  {((s.gpu_mem_used_mb || 0) / 1024).toFixed(1)}G
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Thermometer size={9} className="text-orange-400/60 shrink-0" />
                <span className="text-muted-foreground/50">Temp</span>
                <span
                  className={`tabular-nums ml-auto ${(s.gpu_temp || 0) > 80 ? 'text-red-400' : (s.gpu_temp || 0) > 65 ? 'text-amber-400' : 'text-foreground/50'}`}>
                  {s.gpu_temp || '—'}°C
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Vertical stepper showing which pipeline phases have run / are running. */
export function PipelineProgress({ events }: { events: BuildEvent[] }) {
  const activeSteps = new Set(events.map((e) => e.step));
  const lastStep = events.length > 0 ? events[events.length - 1].step : '';
  const hasError = activeSteps.has('error');

  return (
    <div className="py-1">
      {PIPELINE_STEPS.map((step, i) => {
        const done =
          activeSteps.has(step) && (step !== lastStep || step === 'done');
        const active = step === lastStep && step !== 'done' && !hasError;
        return (
          <div key={step} className="flex items-start gap-0">
            {/* Dot + connector column */}
            <div className="flex flex-col items-center w-4 shrink-0">
              {active ? (
                <span className="w-2.5 h-2.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin mt-[1px]" />
              ) : (
                <span
                  className={`w-2 h-2 rounded-full mt-[3px] ${
                    done
                      ? 'bg-emerald-400'
                      : hasError && activeSteps.has(step)
                        ? 'bg-red-400'
                        : 'bg-muted-foreground/20'
                  }`}
                />
              )}
              {i < PIPELINE_STEPS.length - 1 && (
                <div
                  className={`w-px flex-1 min-h-[8px] mt-0.5 ${done ? 'bg-emerald-500/30' : 'bg-border/20'}`}
                />
              )}
            </div>
            {/* Label */}
            <span
              className={`text-[10px] leading-tight pb-1 ${
                done
                  ? 'text-emerald-400/80'
                  : active
                    ? 'text-blue-400 font-medium'
                    : 'text-muted-foreground/40'
              }`}>
              {STEP_LABELS[step]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Scrollable build/event log with click-to-expand details. */
export function EventLog({
  events,
  expanded,
}: {
  events: BuildEvent[];
  expanded?: boolean;
}) {
  const [openDetails, setOpenDetails] = useState<Set<number>>(new Set());

  return (
    <div className={`space-y-0 ${expanded ? '' : 'max-h-64 overflow-auto'}`}>
      {events.map((ev, i) => (
        <div key={i} className="group">
          <div
            className={`flex items-start gap-2 text-[11px] font-mono px-1 py-0.5 rounded hover:bg-muted/10 transition-colors ${ev.detail ? 'cursor-pointer' : ''}`}
            onClick={() => {
              if (!ev.detail) return;
              setOpenDetails((prev) => {
                const next = new Set(prev);
                next.has(i) ? next.delete(i) : next.add(i);
                return next;
              });
            }}>
            <span className="text-muted-foreground/40 shrink-0 tabular-nums whitespace-nowrap">
              {fmtTime(ev.timestamp)}
            </span>
            <span
              className={`shrink-0 whitespace-nowrap ${STEP_COLORS[ev.step] || 'text-blue-400/60'}`}>
              {STEP_LABELS[ev.step] || ev.step}
            </span>
            <span className="text-foreground/60 flex-1 break-words whitespace-pre-wrap">
              {ev.message}
            </span>
            {ev.latency && (
              <span className="text-muted-foreground/30 ml-auto shrink-0 tabular-nums">
                {ev.latency}
              </span>
            )}
          </div>
          {ev.detail && openDetails.has(i) && (
            <div className="ml-[60px] mr-2 mb-1 p-2 rounded bg-muted/20 border border-border/10">
              <pre className="text-[10px] font-mono text-muted-foreground/60 whitespace-pre-wrap break-words max-h-48 overflow-auto">
                {ev.detail}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Per-task progress board: derives status from streamed `task` events. */
export function TaskBoard({ events }: { events: BuildEvent[] }) {
  const taskBoardEvent = events.find((e) => e.tasks && e.tasks.length > 0);
  if (!taskBoardEvent?.tasks) return null;

  const taskStatus = new Map<
    number,
    { status: string; latency?: string; files?: string }
  >();
  for (const ev of events) {
    if (ev.step === 'task' && ev.taskId) {
      if (ev.message.startsWith('▶'))
        taskStatus.set(ev.taskId, { status: 'running' });
      else if (ev.message.startsWith('✓'))
        taskStatus.set(ev.taskId, {
          status: 'done',
          latency: ev.latency,
          files: ev.detail,
        });
      else if (ev.message.startsWith('✗'))
        taskStatus.set(ev.taskId, { status: 'error' });
    }
  }

  const planEvent = events.find(
    (e) => e.step === 'planning' && e.detail && e.detail.startsWith('{'),
  );
  let plan: { description?: string; architecture?: string } | null = null;
  if (planEvent?.detail) {
    try {
      plan = JSON.parse(planEvent.detail);
    } catch {
      // Plan detail wasn't JSON — leave plan null and fall through.
    }
  }

  const tasks = taskBoardEvent.tasks;
  const doneCount = [...taskStatus.values()].filter(
    (s) => s.status === 'done',
  ).length;

  return (
    <div className="px-3 py-2.5 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {doneCount}/{tasks.length} tasks
        </span>
        {plan?.description && (
          <span className="text-[10px] text-muted-foreground/50 truncate ml-4">
            {plan.description}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-muted/30 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${(doneCount / tasks.length) * 100}%` }}
        />
      </div>

      {/* Task list — compact */}
      <div className="space-y-px">
        {tasks.map((task) => {
          const live = taskStatus.get(task.id);
          const status = live?.status || task.status;
          return (
            <div
              key={task.id}
              className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/10 transition-colors">
              <span
                className={`text-[10px] shrink-0 ${
                  status === 'done'
                    ? 'text-emerald-400'
                    : status === 'running'
                      ? 'text-blue-400 animate-pulse'
                      : status === 'error'
                        ? 'text-red-400'
                        : 'text-muted-foreground/30'
                }`}>
                {status === 'done'
                  ? '✓'
                  : status === 'running'
                    ? '◐'
                    : status === 'error'
                      ? '✗'
                      : '○'}
              </span>
              <span
                className={`text-[11px] flex-1 truncate ${status === 'done' ? 'text-muted-foreground' : 'text-foreground/80'}`}>
                {task.title}
              </span>
              <span
                className={`text-[9px] shrink-0 px-1.5 py-0.5 rounded ${
                  task.worker === 'heavy'
                    ? 'text-cyan-400/70 bg-cyan-500/5'
                    : 'text-teal-400/70 bg-teal-500/5'
                }`}>
                {task.worker === 'heavy' ? '⚡' : '💡'}{' '}
                {task.nodeName || task.worker}
              </span>
              {live?.latency && (
                <span className="text-[9px] text-muted-foreground/40 tabular-nums shrink-0">
                  {live.latency}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
