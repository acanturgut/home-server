import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  House,
  MessageSquare,
  Network,
  Send,
  Server,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { gotoPage } from '@/lib/format';
import { Section } from '@/components/ui/section';
import { OverviewBar } from '@/features/dashboard/components/OverviewBar';
import { DashboardDataProvider } from '@/features/dashboard/components/DashboardDataProvider';
import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';

/** Flat dashboard. No gradients, no shadows, no blobs. */

function dispatchNav(page: string) {
  gotoPage(page);
}

function dispatchChatPrompt(prompt: string) {
  gotoPage('chat');
  setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent('chat:prefill-prompt', { detail: { prompt } }),
    );
  }, 50);
}

function timeOfDayGreeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Working late';
}

interface QuickTile {
  id: string;
  label: string;
  hint: string;
  Icon: LucideIcon;
  accent: string;
}

const QUICK_TILES: QuickTile[] = [
  { id: 'chat', label: 'Chat', hint: 'Talk to your home', Icon: MessageSquare, accent: 'text-rose-300' },
  { id: 'network', label: 'Network', hint: 'Devices, block / unblock', Icon: Network, accent: 'text-sky-300' },
  { id: 'home', label: 'Smart Home', hint: 'Lights, sensors, scenes', Icon: House, accent: 'text-amber-300' },
  { id: 'cluster', label: 'Cluster', hint: 'Nodes, CPU, GPU', Icon: Server, accent: 'text-emerald-300' },
  { id: 'ai', label: 'AI', hint: 'Tokens, latency, models', Icon: Sparkles, accent: 'text-violet-300' },
];

function QuickTiles() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {QUICK_TILES.map(({ id, label, hint, Icon, accent }) => (
        <button
          key={id}
          onClick={() => dispatchNav(id)}
          className="group relative flex flex-col items-start gap-3 rounded-xl border border-border/40 bg-card/40 p-4 hover:border-primary/50 hover:bg-card/60 active:scale-[0.98] transition-colors text-left min-h-24">
          <Icon size={20} className={accent} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">{label}</div>
            <div className="text-xs text-muted-foreground/80 mt-0.5 leading-snug">
              {hint}
            </div>
          </div>
          <ArrowRight
            size={14}
            className="absolute top-4 right-4 text-muted-foreground/40 group-hover:text-foreground/80 transition-colors"
          />
        </button>
      ))}
    </div>
  );
}

function HeroGreeting() {
  const { lastTick, ready } = useDashboardData();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const greeting = useMemo(() => timeOfDayGreeting(new Date(now)), [now]);
  const ageMs = lastTick ? now - lastTick : 0;
  const fresh = ready && ageMs < 8000;
  const timeStr = new Date(now).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const [prompt, setPrompt] = useState('');
  const submit = () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      dispatchNav('chat');
      return;
    }
    dispatchChatPrompt(trimmed);
    setPrompt('');
  };

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            {greeting}
          </h2>
          <p className="text-sm text-muted-foreground/80 mt-1">
            {fresh ? (
              <span className="text-emerald-300/95 font-medium">Online</span>
            ) : (
              <span className="text-amber-300/95 font-medium">Connecting</span>
            )}{' '}
            · {timeStr}
          </p>
        </div>
        <span className="relative flex h-2 w-2 mt-2 shrink-0">
          {fresh && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              fresh ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
          />
        </span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/50 px-3 py-2 focus-within:border-primary/50 transition-colors">
        <Sparkles size={16} className="text-primary/80 shrink-0" />
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask AI to control your home…"
          className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/60 focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Send"
          className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-md bg-primary/15 hover:bg-primary/25 text-primary transition-colors">
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}

export function DashboardPage() {
  return (
    <DashboardDataProvider>
      <div className="space-y-6">
        <HeroGreeting />
        <OverviewBar />
        <Section title="Jump to" description="Dive into a specific area.">
          <QuickTiles />
        </Section>
      </div>
    </DashboardDataProvider>
  );
}
