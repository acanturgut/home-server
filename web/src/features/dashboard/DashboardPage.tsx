import { useState, type FormEvent } from 'react';
import {
  House,
  MessageSquare,
  Network,
  Send,
  Server,
  Sparkles,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Section } from '@/components/ui/section';
import { StatusDot } from '@/components/ui/status-dot';
import { dashboardApi, type DashboardOverview } from '@/features/dashboard/api';
import { OverviewBar } from '@/features/dashboard/components/OverviewBar';
import { usePolling } from '@/hooks/usePolling';
import { formatTime } from '@/lib/format';
import { gotoPage } from '@/lib/routing';

/** The server caches the overview for 10 min; polling it doubles as a heartbeat. */
const OVERVIEW_INTERVAL_MS = 60_000;

// ponytail: mirrors app/navItems (features may not import app/); keep in sync.
const QUICK_TILES = [
  {
    id: 'chat',
    label: 'Chat',
    hint: 'Talk to your home',
    Icon: MessageSquare,
  },
  {
    id: 'network',
    label: 'Network',
    hint: 'Devices, block and unblock',
    Icon: Network,
  },
  {
    id: 'home',
    label: 'Smart home',
    hint: 'Lights, sensors, scenes',
    Icon: House,
  },
  {
    id: 'cluster',
    label: 'Cluster',
    hint: 'Nodes, CPU, GPU',
    Icon: Server,
  },
  {
    id: 'ai',
    label: 'AI',
    hint: 'Tokens, latency, models',
    Icon: Sparkles,
  },
];

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 5 || h >= 22) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Home page: greeting with an Ask AI box, overview tiles, shortcuts. */
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
      <Section title="Jump to">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {QUICK_TILES.map((t) => (
            <Card
              key={t.id}
              interactive
              render={<button type="button" onClick={() => gotoPage(t.id)} />}
              className="space-y-2"
            >
              <t.Icon className="size-5 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-medium">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.hint}</p>
              </div>
            </Card>
          ))}
        </div>
      </Section>
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
