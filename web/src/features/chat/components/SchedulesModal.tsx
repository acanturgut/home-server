import { useEffect, useState } from 'react';
import { Clock, Play, Trash2, X } from 'lucide-react';
import { chatApi } from '@/features/chat/api';

/** Persisted scheduled-prompt record returned from `/api/schedules`. */
type ScheduleRec = {
  id: string;
  title: string;
  prompt: string;
  cron: string;
  route?: string;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  lastResult?: string;
  lastError?: string;
};

/** Modal listing all scheduled prompts with toggle / run-now / delete. */
export function SchedulesModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ScheduleRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const arr = await chatApi.listSchedules<ScheduleRec>();
      setItems(Array.isArray(arr) ? arr : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const toggle = async (sc: ScheduleRec) => {
    setBusy(sc.id);
    try {
      await chatApi.upsertSchedule({ ...sc, enabled: !sc.enabled });
      await load();
    } finally {
      setBusy(null);
    }
  };
  const runNow = async (sc: ScheduleRec) => {
    setBusy(sc.id);
    try {
      await chatApi.runSchedule(sc.id);
      await load();
    } finally {
      setBusy(null);
    }
  };
  const del = async (sc: ScheduleRec) => {
    if (!confirm(`Delete schedule "${sc.title}"?`)) return;
    setBusy(sc.id);
    try {
      await chatApi.deleteSchedule(sc.id);
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-20"
      onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[720px] max-w-[94vw] bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
          <Clock size={12} className="text-muted-foreground/60" />
          <span className="text-sm text-foreground flex-1">
            Scheduled prompts
          </span>
          <button
            onClick={onClose}
            className="text-muted-foreground/50 hover:text-foreground">
            <X size={12} />
          </button>
        </div>
        <div className="overflow-auto divide-y divide-white/5">
          {loading && (
            <div className="px-3 py-8 text-center text-[11px] text-muted-foreground/50">
              Loading…
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-3 py-10 text-center text-[12px] text-muted-foreground/40 space-y-2">
              <div>No schedules yet.</div>
              <div className="font-mono text-[10px] text-muted-foreground/30">
                /schedule @every 1h What is new?
              </div>
            </div>
          )}
          {items.map((sc) => (
            <div key={sc.id} className="px-3 py-2 space-y-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggle(sc)}
                  disabled={busy === sc.id}
                  title={sc.enabled ? 'Disable' : 'Enable'}
                  className={`w-2 h-2 rounded-full shrink-0 ${sc.enabled ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-foreground/90 truncate">
                    {sc.title}
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 font-mono">
                    {sc.cron}
                    {sc.route && ` · ${sc.route}`}
                    {sc.nextRun &&
                      ` · next ${new Date(sc.nextRun).toLocaleString()}`}
                  </div>
                </div>
                <button
                  onClick={() => runNow(sc)}
                  disabled={busy === sc.id}
                  title="Run now"
                  className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-white/5 disabled:opacity-40">
                  <Play size={11} />
                </button>
                <button
                  onClick={() => del(sc)}
                  disabled={busy === sc.id}
                  title="Delete"
                  className="p-1 rounded text-red-400/70 hover:text-red-300 hover:bg-white/5 disabled:opacity-40">
                  <Trash2 size={11} />
                </button>
              </div>
              {sc.lastError && (
                <div className="text-[10px] text-red-300/80 font-mono truncate">
                  ✗ {sc.lastError}
                </div>
              )}
              {sc.lastResult && !sc.lastError && (
                <div className="text-[10px] text-muted-foreground/50 truncate italic">
                  ↳ {sc.lastResult.slice(0, 120)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
