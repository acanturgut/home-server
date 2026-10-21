import { useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { StatusDot } from '@/components/ui/status-dot';
import { dashboardApi, type DashboardOverview } from '@/features/dashboard/api';
import { OverviewBar } from '@/features/dashboard/components/OverviewBar';
import { usePolling } from '@/hooks/usePolling';
import { formatTime } from '@/lib/format';
import { gotoPage } from '@/lib/routing';

/** The server caches the overview for 10 min; polling it doubles as a heartbeat. */
const OVERVIEW_INTERVAL_MS = 60_000;

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 5 || h >= 22) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Home page: greeting with an Ask AI box and overview tiles. */
export function DashboardPage() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  usePolling(async () => {
    const d = await dashboardApi.overview();
    setOnline(d !== null);
    if (d) setOverview(d);
  }, OVERVIEW_INTERVAL_MS);

  return (
    <div className="space-y-6">
      <HeroGreeting online={online} />
      <OverviewBar data={overview} />
    </div>
  );
}

/** `online` is null until the first heartbeat. */
function HeroGreeting({ online }: { online: boolean | null }) {
  const [now, setNow] = useState(() => new Date());
  usePolling(() => setNow(new Date()), 10_000);
  const [prompt, setPrompt] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    gotoPage('chat', { prompt: prompt.trim() || undefined });
  };

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-medium">{greeting(now)}</h2>
        <p className="mt-1 flex items-center gap-2 text-muted-foreground">
          <StatusDot
            status={online ? 'online' : online === null ? 'warning' : 'error'}
          />
          {online ? 'Online' : online === null ? 'Connecting' : 'Offline'}
          <span aria-hidden>·</span>
          {formatTime(now)}
        </p>
      </div>
      <form onSubmit={submit} className="flex items-center gap-2">
        <Input
          aria-label="Ask AI"
          placeholder="Ask AI to control your home…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="flex-1"
        />
        <IconButton type="submit" icon={<Send />} label="Ask" size="default" />
      </form>
    </Card>
  );
}
