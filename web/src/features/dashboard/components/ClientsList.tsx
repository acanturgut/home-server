import { useEffect, useState } from 'react';
import { Users, ArrowRight } from 'lucide-react';
import { dashboardApi, type DashboardClient } from '@/features/dashboard/api';

function ago(ts: string) {
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 1000) return 'now';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}

function shortenAgent(ua?: string) {
  if (!ua) return '';
  const u = ua.toLowerCase();
  if (u.includes('chrome')) return 'Chrome';
  if (u.includes('safari')) return 'Safari';
  if (u.includes('firefox')) return 'Firefox';
  if (u.includes('curl')) return 'curl';
  if (u.includes('go-http')) return 'agent';
  if (u.includes('python')) return 'python';
  return ua.split(' ')[0]?.slice(0, 18) || '';
}

/**
 * Recent HTTP requesters — pulled from the in-memory tracker on the server.
 * Static rolling window: last hour, top 20 by recency.
 */
export function ClientsList() {
  const [clients, setClients] = useState<DashboardClient[]>([]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const d = await dashboardApi.clients();
      if (alive && d) setClients(d);
    };
    run();
    const id = setInterval(run, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground/70">
        <Users size={11} className="text-emerald-400/80" />
        Who's connected
        <span className="text-muted-foreground/65 normal-case tracking-normal ml-auto">
          {clients.length} client{clients.length === 1 ? '' : 's'} · last hour
        </span>
      </div>
      {clients.length === 0 ? (
        <p className="text-xs text-muted-foreground/65 italic text-center py-6">
          No recent requests.
        </p>
      ) : (
        <div className="space-y-1">
          {clients.map((c) => (
            <div
              key={c.ip}
              className="flex items-center gap-2 text-xs py-1 px-1.5 rounded hover:bg-white/[0.02]">
              <span
                className="font-mono text-foreground/80 w-28 truncate"
                title={c.ip}>
                {c.ip}
              </span>
              <span className="text-muted-foreground/65 text-xs uppercase">
                {shortenAgent(c.user_agent)}
              </span>
              <ArrowRight
                size={9}
                className="text-muted-foreground/30 shrink-0"
              />
              <span className="text-muted-foreground/65 truncate flex-1 font-mono text-xs">
                {c.last_path}
              </span>
              <span className="text-muted-foreground/70 tabular-nums w-9 text-right">
                {c.count}×
              </span>
              <span className="text-muted-foreground/65 tabular-nums w-7 text-right">
                {ago(c.last_seen)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
