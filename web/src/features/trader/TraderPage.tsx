// Backseat trading dashboard. The premise: the user deposits virtual cash
// and the LLM agent does everything (buy / sell / rotate / take profits).
// Manual trade controls live in a collapsed drawer; the headline UI is
// equity, P/L, allocation, agent thinking, news.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Play,
  Pause,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Wallet,
  Bot,
  Loader2,
  AlertTriangle,
  Newspaper,
  History as HistoryIcon,
  ExternalLink,
  Trash2,
  Settings,
  ChevronDown,
  ChevronRight,
  Globe,
  Activity,
  Target,
  Plug,
  Eye,
  EyeOff,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChatMarkdown } from '@/features/chat/components/ChatMarkdown';
import {
  traderApi,
  type TraderState,
  type TraderQuote,
  type TraderPosition,
  type TraderTrade,
  type TraderNews,
  type TraderAgentLog,
  type TraderConversationTurn,
  type TraderDecision,
  type TraderEquityPoint,
  type TraderStats,
  type TraderPricePoint,
  type TraderForecast,
  type TraderTickStatus,
  type TraderMarketSession,
  type TraderTask,
  type TraderTaskStatus,
  type TraderTaskKind,
} from './api';

// ─── helpers ────────────────────────────────────────────────────────────────

const fmtUSD = (n: number, frac = 2) =>
  (n ?? 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  });

const fmtUSDCompact = (n: number) => {
  const abs = Math.abs(n ?? 0);
  if (abs >= 1_000_000)
    return `${n < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000).toFixed(1)}k`;
  return fmtUSD(n);
};

const fmtPct = (n: number) =>
  `${n >= 0 ? '+' : ''}${(n ?? 0).toFixed(2)}%`;

const fmtQty = (n: number) => {
  if (Math.abs(n - Math.round(n)) < 0.0001) return n.toFixed(0);
  return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
};

const positionDirection = (qty: number): 'long' | 'short' | 'flat' => {
  if (qty > 0) return 'long';
  if (qty < 0) return 'short';
  return 'flat';
};

const tradePositionType = (side: TraderTrade['side']): 'long' | 'short' => {
  if (side === 'short' || side === 'cover') return 'short';
  return 'long';
};

const tradeLegType = (
  side: TraderTrade['side'],
): 'open' | 'close' | 'add' => {
  if (side === 'add') return 'add';
  if (side === 'sell' || side === 'cover') return 'close';
  return 'open';
};

const tradeNetRevenue = (t: TraderTrade): number => {
  // Positive means cash in, negative means cash out.
  if (t.side === 'buy' || t.side === 'add' || t.side === 'cover') {
    return -Math.abs(t.total ?? 0);
  }
  return Math.abs(t.total ?? 0);
};

type TradeLot = {
  qty: number;
  price: number;
};

function buildMatchedClosePL(trades: TraderTrade[]): {
  byTradeId: Record<string, number>;
  closedCount: number;
  wins: number;
  losses: number;
  net: number;
  agentClosedCount: number;
  agentWins: number;
  agentLosses: number;
  agentNet: number;
} {
  const longLotsBySym: Record<string, TradeLot[]> = {};
  const shortLotsBySym: Record<string, TradeLot[]> = {};
  const byTradeId: Record<string, number> = {};

  let closedCount = 0;
  let wins = 0;
  let losses = 0;
  let net = 0;
  let agentClosedCount = 0;
  let agentWins = 0;
  let agentLosses = 0;
  let agentNet = 0;

  const ordered = [...trades].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
  );

  for (const t of ordered) {
    const sym = t.symbol;
    const qty = Math.max(0, t.qty ?? 0);
    if (!sym || qty <= 0) continue;

    if (!longLotsBySym[sym]) longLotsBySym[sym] = [];
    if (!shortLotsBySym[sym]) shortLotsBySym[sym] = [];

    if (t.side === 'buy' || t.side === 'add') {
      longLotsBySym[sym].push({ qty, price: t.price });
      continue;
    }
    if (t.side === 'short') {
      shortLotsBySym[sym].push({ qty, price: t.price });
      continue;
    }

    let remaining = qty;
    let pl = 0;
    if (t.side === 'sell') {
      const lots = longLotsBySym[sym];
      while (remaining > 0 && lots.length > 0) {
        const lot = lots[0];
        const m = Math.min(remaining, lot.qty);
        pl += (t.price - lot.price) * m;
        lot.qty -= m;
        remaining -= m;
        if (lot.qty <= 0.0000001) lots.shift();
      }
    } else if (t.side === 'cover') {
      const lots = shortLotsBySym[sym];
      while (remaining > 0 && lots.length > 0) {
        const lot = lots[0];
        const m = Math.min(remaining, lot.qty);
        pl += (lot.price - t.price) * m;
        lot.qty -= m;
        remaining -= m;
        if (lot.qty <= 0.0000001) lots.shift();
      }
    }

    byTradeId[t.id] = pl;
    closedCount++;
    net += pl;
    if (pl > 0) wins++;
    if (pl < 0) losses++;
    if (t.source === 'agent') {
      agentClosedCount++;
      agentNet += pl;
      if (pl > 0) agentWins++;
      if (pl < 0) agentLosses++;
    }
  }

  return {
    byTradeId,
    closedCount,
    wins,
    losses,
    net,
    agentClosedCount,
    agentWins,
    agentLosses,
    agentNet,
  };
}

const fmtTime = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
};

const fmtTimeShort = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

function normalizeState(s: TraderState): TraderState {
  return {
    ...s,
    watchlist: s.watchlist ?? [],
    positions: s.positions ?? [],
    trades: s.trades ?? [],
    logs: s.logs ?? [],
    quotes: s.quotes ?? [],
    news: s.news ?? [],
    equity_history: s.equity_history ?? [],
    plans: s.plans ?? [],
    memo: s.memo ?? '',
    price_history: s.price_history ?? {},
    forecasts: s.forecasts ?? {},
    tick_status: s.tick_status ?? {
      active: false,
      phase: '',
      step: 0,
      total: 0,
    },
    cash: s.cash ?? 0,
    deposited: s.deposited ?? 0,
    withdrawn: s.withdrawn ?? 0,
    equity: s.equity ?? 0,
    pl: s.pl ?? 0,
    interval_min: s.interval_min || 1,
    stats: s.stats ?? {
      total_trades: 0,
      buy_count: 0,
      sell_count: 0,
      wins: 0,
      losses: 0,
      win_rate: 0,
      realised_pl: 0,
      unrealised_pl: 0,
      best_symbol_pl: 0,
      worst_symbol_pl: 0,
      positions_value: 0,
    },
  };
}

// Yahoo-style suffix → region mapping for the grouped watchlist view.
function regionForSymbol(sym: string): string {
  const s = sym.toUpperCase();
  if (s.endsWith('-USD')) return 'Crypto';
  if (s.endsWith('=F')) return 'Futures';
  if (/\.(L|DE|PA|AS|SW|CO|MI|MC|BR|ST|HE|VI|LS)$/.test(s)) return 'Europe';
  if (/\.(T|HK|KS|SS|SZ|TW|SI|BO|NS|JK)$/.test(s)) return 'Asia';
  if (/\.(AX|NZ)$/.test(s)) return 'Oceania';
  if (/\.(TO|V|MX|SA|BA|SN)$/.test(s)) return 'Americas (Intl)';
  if (/\.IS$/.test(s)) return 'Türkiye';
  if (
    [
      'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'XLE', 'XLF', 'XLK', 'SOXX', 'ARKK',
      'GLD', 'SLV', 'USO', 'TLT', 'UUP',
    ].includes(s)
  )
    return 'Macro / ETF';
  return 'US Stocks';
}

const REGION_ORDER = [
  'US Stocks',
  'Macro / ETF',
  'Europe',
  'Asia',
  'Oceania',
  'Americas (Intl)',
  'Türkiye',
  'Futures',
  'Crypto',
];

const WATCHLIST_PRESETS: { label: string; symbols: string[] }[] = [
  {
    label: 'US Mega-cap',
    symbols: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AMD'],
  },
  {
    label: 'Global Diversified',
    symbols: [
      'AAPL', 'MSFT', 'NVDA', 'SPY', 'QQQ',
      'ASML.AS', 'SAP.DE', 'MC.PA', 'NESN.SW',
      '7203.T', '0700.HK', 'TSM',
      'GLD', 'TLT', 'BTC-USD', 'ETH-USD',
    ],
  },
  {
    label: 'Macro Hedge',
    symbols: ['SPY', 'QQQ', 'GLD', 'SLV', 'TLT', 'UUP', 'USO', 'BTC-USD'],
  },
  { label: 'Crypto', symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD'] },
  {
    label: 'Europe',
    symbols: [
      'ASML.AS', 'SAP.DE', 'SIE.DE', 'MC.PA', 'NESN.SW',
      'NOVO-B.CO', 'HSBA.L', 'SHEL.L',
    ],
  },
  {
    label: 'Asia',
    symbols: ['7203.T', '9984.T', '6758.T', 'BABA', '0700.HK', 'TSM', '005930.KS'],
  },
];

// ─── page ───────────────────────────────────────────────────────────────────

export function TraderPage() {
  const [state, setState] = useState<TraderState | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const next = await traderApi.state();
    if (next) setState(normalizeState(next));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    // Poll fast (1.5s) while a tick is actively running, otherwise a
    // brisk 3s so the live price / equity / position values feel live.
    const active = state?.tick_status?.active ?? false;
    const period = active ? 1500 : 3000;
    pollTimer.current = window.setInterval(refresh, period);
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
    };
  }, [refresh, state?.tick_status?.active]);

  const onAction = async (fn: () => Promise<unknown>, label: string) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await fn();
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`${label}: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        <Loader2 className="animate-spin mr-2" size={16} /> Loading trader…
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 space-y-6">
      <LiveDiscussionSidebar status={state.tick_status} />
      {errorMsg && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-sm p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="flex-1">{errorMsg}</div>
          <button
            className="text-xs opacity-70 hover:opacity-100"
            onClick={() => setErrorMsg(null)}>
            ✕
          </button>
        </div>
      )}

      <Hero
        state={state}
        busy={busy}
        onStart={() => onAction(traderApi.start, 'Start')}
        onStop={() => onAction(traderApi.stop, 'Stop')}
        onTick={() => onAction(traderApi.tick, 'Tick')}
        onReset={() => {
          if (
            window.confirm(
              'Reset trader? This wipes cash, positions, trades, memo, plans, and history. Cannot be undone.',
            )
          ) {
            onAction(traderApi.reset, 'Reset');
          }
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <EquityChartCard history={state.equity_history} />
        </div>
        <StatsCard stats={state.stats} state={state} />
      </div>

      <MarketSessionsCard sessions={state.sessions ?? []} />

      <MemoCard memo={state.memo} lastTick={state.last_tick} />

      <TaskBoardCard tasks={state.tasks ?? []} onChanged={refresh} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <PositionsCard state={state} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AllocationCard state={state} />
            <NewsCard news={state.news} />
          </div>
        </div>
        <DecisionReportsCard logs={state.logs} state={state} />
      </div>

      <WatchlistCard
        state={state}
        busy={busy}
        onSave={(syms, interval) =>
          onAction(
            () => traderApi.setWatchlist(syms, interval),
            'Update watchlist',
          )
        }
      />

      <BrokerSettingsCard onChanged={refresh} />

      <TradesCard trades={state.trades} />

      <AdvancedCard
        state={state}
        busy={busy}
        onTrade={(s, side, qty) =>
          onAction(() => traderApi.manualTrade(s, side, qty), 'Manual trade')
        }
        onReset={() => onAction(traderApi.reset, 'Reset')}
      />
    </div>
  );
}

// ─── Hero ───────────────────────────────────────────────────────────────────

function Hero(props: {
  state: TraderState;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
  onTick: () => void;
  onReset: () => void;
}) {
  const { state, busy } = props;

  // P/L vs starting equity — since cash & equity are now sourced from
  // Alpaca, we anchor the % return against the broker's starting cash
  // (deposited - withdrawn is the historical sim figure; for the live
  // broker we just show absolute P/L).
  const baseline = state.deposited > 0 ? state.deposited : state.equity - state.pl;
  const plPct = baseline > 0 ? (state.pl / baseline) * 100 : 0;
  const isUp = state.pl >= 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`h-12 w-12 rounded-xl flex items-center justify-center ${
              state.running
                ? 'bg-emerald-500/15 text-emerald-500'
                : 'bg-muted text-muted-foreground'
            }`}>
            <Bot size={22} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Backseat Paper Trader
            </div>
            <div className="text-xl font-semibold text-foreground flex items-center gap-2">
              {state.running ? (
                <>
                  Agent live
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                </>
              ) : (
                <>Agent paused</>
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Ticks every {state.interval_min} min · Last:{' '}
              {fmtTimeShort(state.last_tick)} · Next:{' '}
              {state.running ? fmtTimeShort(state.next_tick) : '—'}
            </div>
            {state.broker?.name ? (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    state.broker.connected
                      ? 'bg-emerald-500'
                      : 'bg-destructive'
                  }`}
                />
                {state.broker.name}
                {state.broker.connected
                  ? ` · ${fmtUSD(state.broker.buying_power)} BP`
                  : state.broker.error
                    ? ` · ${state.broker.error.slice(0, 40)}`
                    : ' · connecting…'}
              </div>
            ) : null}
            {state.broker?.pending_orders && state.broker.pending_orders.length > 0 ? (
              <div className="mt-2 ml-2 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                <Loader2 size={10} className="animate-spin" />
                {state.broker.pending_orders.length} pending order
                {state.broker.pending_orders.length === 1 ? '' : 's'}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {state.running ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={props.onStop}>
              <Pause size={14} className="mr-1.5" />
              Stop agent
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={props.onStart}>
              <Play size={14} className="mr-1.5" />
              Start agent
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={props.onTick}>
            <RefreshCw size={14} className="mr-1.5" />
            Run tick now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={props.onReset}
            className="text-destructive hover:text-destructive hover:bg-destructive/10">
            <Trash2 size={14} className="mr-1.5" />
            Reset
          </Button>
        </div>
      </div>

      <TickProgress
        status={state.tick_status}
        lastTick={state.last_tick}
        nextTick={state.next_tick}
        intervalMin={state.interval_min}
        running={state.running}
      />

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <BigStat
          label="Equity"
          value={fmtUSD(state.equity)}
          icon={<Wallet size={14} />}
        />
        <BigStat
          label="P/L"
          value={fmtUSD(state.pl)}
          sub={fmtPct(plPct)}
          tone={isUp ? 'up' : 'down'}
          icon={isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        />
        <BigStat
          label="Cash"
          value={fmtUSD(state.cash)}
          sub={`${fmtUSD(state.stats.positions_value)} invested`}
        />
        <BigStat
          label="Buying power"
          value={
            state.broker?.connected
              ? fmtUSD(state.broker.buying_power)
              : fmtUSD(state.cash)
          }
          sub={state.broker?.connected ? 'Alpaca' : 'simulated'}
        />
      </div>
    </section>
  );
}

// ─── Tick progress bar ──────────────────────────────────────────────────────

// PHASES are the named steps the backend reports while a tick is in flight.
// We render them as a labelled stepper above an animated linear progress bar.
const TICK_PHASES: { key: string; label: string }[] = [
  { key: 'refreshing_quotes', label: 'Quotes' },
  { key: 'fetching_news', label: 'News' },
  { key: 'asking_llm', label: 'LLM' },
  { key: 'executing', label: 'Trade' },
];

function TickProgress({
  status,
  lastTick,
  nextTick,
  intervalMin,
  running,
}: {
  status: TraderTickStatus;
  lastTick?: string;
  nextTick?: string;
  intervalMin: number;
  running: boolean;
}) {
  // We tick our own clock so the countdown progress bar moves smoothly
  // between server polls (which only happen every 10s when idle).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  const active = status.active;
  const total = status.total || TICK_PHASES.length;
  let pct = 0;
  let label = '';
  let tone: 'active' | 'idle' | 'error' | 'done' = 'idle';
  let detail = status.message ?? '';

  if (status.phase === 'error') {
    tone = 'error';
    pct = 100;
    label = 'Tick failed';
  } else if (active) {
    tone = 'active';
    pct = Math.max(5, Math.round((status.step / total) * 100));
    const cur = TICK_PHASES.find((p) => p.key === status.phase);
    label = `Step ${status.step}/${total} — ${cur?.label ?? status.phase}`;
  } else if (running) {
    // Idle countdown: progress = elapsed since last_tick / interval.
    // Note: the backend persists next_tick lazily (only on tick completion),
    // so the value we receive often points at the start of the LAST tick.
    // We compute the real next-tick locally from last_tick + interval and
    // fall through to "first tick" wording if neither is usable.
    const intervalMs = Math.max(60_000, intervalMin * 60_000);
    let next = nextTick ? new Date(nextTick).getTime() : NaN;
    if (!isFinite(next) || next <= now - 5_000) {
      // Stale or missing — recompute from last_tick.
      const last = lastTick ? new Date(lastTick).getTime() : NaN;
      next = isFinite(last) ? last + intervalMs : now + intervalMs;
    }
    const remaining = Math.max(0, next - now);
    pct = Math.min(
      99,
      Math.round(((intervalMs - remaining) / intervalMs) * 100),
    );
    label = `Next tick in ${fmtCountdown(remaining)}`;
    if (lastTick) {
      detail = `last ${fmtTimeShort(lastTick)}`;
    }
  } else {
    tone = 'idle';
    pct = 0;
    label = running ? 'Waiting for first tick…' : 'Agent paused';
  }

  const barColor =
    tone === 'error'
      ? 'bg-red-500'
      : tone === 'active'
        ? 'bg-blue-500'
        : 'bg-emerald-500';

  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between mb-1.5 text-[11px]">
        <span className="font-medium text-foreground/90 flex items-center gap-2">
          {active && (
            <Loader2 size={11} className="animate-spin text-blue-500" />
          )}
          {label}
        </span>
        <span className="text-muted-foreground tabular-nums">{detail}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden relative">
        <div
          className={`h-full ${barColor} transition-all duration-500 ease-out ${
            active ? 'animate-pulse' : ''
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {(active || tone === 'error') && (
        <div className="mt-2 grid grid-cols-4 gap-1 text-[10px] uppercase tracking-widest">
          {TICK_PHASES.map((p, i) => {
            const stepNum = i + 1;
            const done = stepNum < status.step;
            const cur = stepNum === status.step;
            return (
              <div
                key={p.key}
                className={`flex items-center gap-1.5 ${
                  done
                    ? 'text-emerald-500'
                    : cur
                      ? tone === 'error'
                        ? 'text-red-500'
                        : 'text-blue-500'
                      : 'text-muted-foreground/60'
                }`}>
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    done
                      ? 'bg-emerald-500'
                      : cur
                        ? tone === 'error'
                          ? 'bg-red-500'
                          : 'bg-blue-500 animate-pulse'
                        : 'bg-muted-foreground/30'
                  }`}
                />
                {p.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function BigStat({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  tone?: 'up' | 'down';
}) {
  const toneClass =
    tone === 'up'
      ? 'text-emerald-500'
      : tone === 'down'
        ? 'text-red-500'
        : 'text-foreground';
  return (
    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon} {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </div>
      {sub && (
        <div className="text-xs text-muted-foreground tabular-nums">{sub}</div>
      )}
    </div>
  );
}

// ─── Equity chart (dependency-free inline SVG) ──────────────────────────────

function EquityChartCard({ history }: { history: TraderEquityPoint[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm h-full">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Activity size={15} /> Equity curve
        </h2>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {history.length} samples
        </span>
      </header>
      {history.length < 2 ? (
        <div className="h-56 flex items-center justify-center text-xs text-muted-foreground">
          Building chart — needs at least two data points (about a minute).
        </div>
      ) : (
        <EquitySVG points={history} />
      )}
    </section>
  );
}

function EquitySVG({ points }: { points: TraderEquityPoint[] }) {
  const W = 720;
  const H = 220;
  const PAD = { l: 50, r: 14, t: 10, b: 22 };
  const xs = points.map((p) => new Date(p.time).getTime());
  const ys = points.map((p) => p.equity);
  const minX = xs[0];
  const maxX = xs[xs.length - 1];
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padY = Math.max(1, (maxY - minY) * 0.1);
  const lo = minY - padY;
  const hi = maxY + padY;
  const sx = (x: number) =>
    PAD.l + ((x - minX) / Math.max(1, maxX - minX)) * (W - PAD.l - PAD.r);
  const sy = (y: number) =>
    PAD.t + (1 - (y - lo) / Math.max(0.0001, hi - lo)) * (H - PAD.t - PAD.b);

  const d = points
    .map((p, i) => {
      const x = sx(new Date(p.time).getTime());
      const y = sy(p.equity);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const area = `${d} L${sx(maxX).toFixed(1)},${sy(lo).toFixed(1)} L${sx(minX).toFixed(1)},${sy(lo).toFixed(1)} Z`;

  const first = ys[0];
  const last = ys[ys.length - 1];
  const up = last >= first;
  const stroke = up ? '#10b981' : '#ef4444';
  const fill = up ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';

  const gridYs = [0.25, 0.5, 0.75, 1.0].map((t) => lo + (hi - lo) * t);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-56 select-none"
      preserveAspectRatio="none">
      {gridYs.map((gy, i) => (
        <g key={i}>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={sy(gy)}
            y2={sy(gy)}
            stroke="currentColor"
            className="text-border/40"
            strokeDasharray="3 3"
          />
          <text
            x={PAD.l - 6}
            y={sy(gy) + 3}
            textAnchor="end"
            fontSize="10"
            className="fill-muted-foreground tabular-nums">
            {fmtUSDCompact(gy)}
          </text>
        </g>
      ))}
      <path d={area} fill={fill} />
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.6} />
      {[0, Math.floor(points.length / 2), points.length - 1].map((i) => (
        <text
          key={i}
          x={sx(new Date(points[i].time).getTime())}
          y={H - 6}
          textAnchor="middle"
          fontSize="10"
          className="fill-muted-foreground">
          {fmtTimeShort(points[i].time)}
        </text>
      ))}
    </svg>
  );
}

// ─── Stats ──────────────────────────────────────────────────────────────────

function StatsCard({
  stats,
  state,
}: {
  stats: TraderStats;
  state: TraderState;
}) {
  const closed = stats.wins + stats.losses;
  const rows: { label: string; value: string; tone?: 'up' | 'down' }[] = [
    {
      label: 'Realised P/L',
      value: fmtUSD(stats.realised_pl),
      tone: stats.realised_pl >= 0 ? 'up' : 'down',
    },
    {
      label: 'Unrealised P/L',
      value: fmtUSD(stats.unrealised_pl),
      tone: stats.unrealised_pl >= 0 ? 'up' : 'down',
    },
    { label: 'Total trades', value: String(stats.total_trades) },
    { label: 'Buys / Sells', value: `${stats.buy_count} / ${stats.sell_count}` },
    {
      label: 'Win rate',
      value:
        closed > 0
          ? `${stats.win_rate.toFixed(0)}% (${stats.wins}/${closed})`
          : '—',
    },
    { label: 'Open positions', value: String(state.positions.length) },
    { label: 'Universe size', value: String(state.watchlist.length) },
  ];
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Target size={15} /> Performance
      </h2>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{r.label}</span>
            <span
              className={`tabular-nums font-medium ${
                r.tone === 'up'
                  ? 'text-emerald-500'
                  : r.tone === 'down'
                    ? 'text-red-500'
                    : 'text-foreground'
              }`}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
      {(stats.best_symbol || stats.worst_symbol) && (
        <div className="mt-3 pt-3 border-t border-border/40 space-y-1 text-xs">
          {stats.best_symbol && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Best{' '}
                <span className="font-medium text-foreground">
                  {stats.best_symbol}
                </span>
              </span>
              <span className="text-emerald-500 tabular-nums">
                {fmtUSD(stats.best_symbol_pl)}
              </span>
            </div>
          )}
          {stats.worst_symbol && stats.worst_symbol !== stats.best_symbol && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Worst{' '}
                <span className="font-medium text-foreground">
                  {stats.worst_symbol}
                </span>
              </span>
              <span className="text-red-500 tabular-nums">
                {fmtUSD(stats.worst_symbol_pl)}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Market sessions ───────────────────────────────────────────────────────

// MarketSessionsCard shows the open/closed status of US, Europe and Asia
// equity sessions side-by-side. The agent already considers session state
// in its briefing, but this gives the human operator the same context at
// a glance.
function MarketSessionsCard({ sessions }: { sessions: TraderMarketSession[] }) {
  if (!sessions.length) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <header className="mb-3 flex items-center gap-2">
        <Globe size={14} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Markets</h3>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {sessions.map((s) => (
          <SessionTile key={s.name} session={s} />
        ))}
      </div>
    </section>
  );
}

function SessionTile({ session: s }: { session: TraderMarketSession }) {
  const tone =
    s.phase === 'open'
      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
      : s.phase === 'pre' || s.phase === 'post'
        ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
        : 'bg-muted/40 border-border text-muted-foreground';
  const phaseLabel =
    s.phase === 'open'
      ? 'OPEN'
      : s.phase === 'pre'
        ? 'pre-market'
        : s.phase === 'post'
          ? 'after-hours'
          : s.phase === 'weekend'
            ? 'weekend'
            : 'closed';
  // Calculate a friendly countdown until the next session boundary.
  const target = s.open ? s.next_close : s.next_open;
  const countdown = target ? formatCountdown(target) : null;
  const targetLocal = target ? formatLocalClock(target) : null;
  const marketTz = tzAbbrev(s.tz);
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${tone}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider">{s.name}</div>
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            s.open ? 'bg-emerald-500 animate-pulse' : 'bg-current opacity-60'
          }`}
        />
      </div>
      <div className="mt-1 text-base font-semibold">{phaseLabel}</div>
      <div className="mt-0.5 text-[11px] opacity-80 tabular-nums">
        {s.local_now} {marketTz}
      </div>
      {countdown && (
        <div className="mt-0.5 text-[11px] opacity-70 tabular-nums">
          {s.open ? `closes in ${countdown}` : `opens in ${countdown}`}
          {targetLocal ? ` · ${targetLocal} your time` : ''}
        </div>
      )}
    </div>
  );
}

// tzAbbrev derives a short timezone label (ET / BST / JST) from an IANA
// zone name using the browser's Intl API. Falls back to the raw zone
// when the runtime can't produce a short name.
function tzAbbrev(ianaZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaZone,
      timeZoneName: 'short',
    }).formatToParts(new Date());
    const tz = parts.find((p) => p.type === 'timeZoneName');
    return tz?.value || ianaZone;
  } catch {
    return ianaZone;
  }
}

// formatLocalClock renders an ISO timestamp in the user's local timezone
// as a short clock string ("Mon 18:00" or "18:00" if today).
function formatLocalClock(iso: string): string {
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  if (sameDay) return `${hh}:${mm}`;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return `${wd} ${hh}:${mm}`;
}

function formatCountdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (!isFinite(ms) || ms <= 0) return '';
  const totalMin = Math.round(ms / 60000);
  const d = Math.floor(totalMin / (60 * 24));
  const h = Math.floor((totalMin % (60 * 24)) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ─── Memo ───────────────────────────────────────────────────────────────────

// MemoCard shows the agent's running journal — the note it writes for itself
// every tick so context survives between LLM calls. This is the "why" behind
// what's about to happen next.
function MemoCard({ memo, lastTick }: { memo: string; lastTick?: string }) {
  const empty = !memo || !memo.trim();
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <header className="mb-2 flex items-center justify-between">        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Bot size={15} /> Agent journal
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-normal">
            (carried forward each tick)
          </span>
        </h2>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          updated {fmtTimeShort(lastTick)}
        </span>
      </header>
      {empty ? (
        <div className="text-xs text-muted-foreground">
          The agent has not written a journal entry yet. Once you press Start,
          it'll record what it's watching, what would change its mind, and what
          it intends to do next — and read that note back on every following
          tick so context is never lost.
        </div>
      ) : (
        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
          {memo}
        </p>
      )}
    </section>
  );
}

// ─── Allocation ─────────────────────────────────────────────────────────────

function AllocationCard({ state }: { state: TraderState }) {
  const quoteBySymbol = new Map(state.quotes.map((q) => [q.symbol, q]));
  const slices: { symbol: string; value: number; color: string }[] = [];
  state.positions.forEach((p, i) => {
    const last = quoteBySymbol.get(p.symbol)?.price ?? p.avg_cost;
    slices.push({
      symbol: p.symbol,
      value: last * p.qty,
      color: paletteColor(i),
    });
  });
  if (state.cash > 0) {
    slices.push({ symbol: 'Cash', value: state.cash, color: '#64748b' });
  }
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Wallet size={15} /> Allocation
      </h2>
      {slices.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          Empty portfolio — deposit cash to get started.
        </div>
      ) : (
        <>
          <div className="h-3 w-full rounded-full overflow-hidden flex bg-muted/50">
            {slices.map((s) => (
              <div
                key={s.symbol}
                title={`${s.symbol} · ${fmtUSD(s.value)} (${((s.value / total) * 100).toFixed(1)}%)`}
                style={{
                  width: `${(s.value / total) * 100}%`,
                  background: s.color,
                }}
              />
            ))}
          </div>
          <div className="mt-3 space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {slices
              .sort((a, b) => b.value - a.value)
              .map((s) => (
                <div
                  key={s.symbol}
                  className="flex items-center gap-2 text-xs">
                  <span
                    className="inline-block h-2 w-2 rounded-sm shrink-0"
                    style={{ background: s.color }}
                  />
                  <span className="font-medium w-20 truncate">{s.symbol}</span>
                  <span className="text-muted-foreground tabular-nums w-16">
                    {((s.value / total) * 100).toFixed(1)}%
                  </span>
                  <span className="ml-auto tabular-nums">
                    {fmtUSD(s.value)}
                  </span>
                </div>
              ))}
          </div>
        </>
      )}
    </section>
  );
}

function paletteColor(i: number): string {
  const palette = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4',
    '#a855f7', '#eab308', '#22c55e', '#0ea5e9', '#d946ef',
  ];
  return palette[i % palette.length];
}

// ─── Positions ──────────────────────────────────────────────────────────────

function PositionsCard({ state }: { state: TraderState }) {
  const quoteBySymbol = new Map(state.quotes.map((q) => [q.symbol, q]));
  const planBySymbol = new Map(state.plans.map((p) => [p.symbol, p]));
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground mb-3">
        Open positions{' '}
        <span className="text-xs font-normal text-muted-foreground">
          ({state.positions.length})
        </span>
      </h2>
      {state.positions.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          The agent has no open positions yet. Once you press Start, it'll begin
          allocating your cash.
        </div>
      ) : (
        <div className="space-y-4">
          {state.positions.map((p) => {
            const q = quoteBySymbol.get(p.symbol);
            const plan = planBySymbol.get(p.symbol);
            const direction = positionDirection(p.qty);
            const absQty = Math.abs(p.qty);
            const last = q?.price ?? p.avg_cost;
            const value = last * absQty;
            const unreal = (last - p.avg_cost) * p.qty;
            const pct =
              p.avg_cost > 0
                ? direction === 'short'
                  ? ((p.avg_cost - last) / p.avg_cost) * 100
                  : ((last - p.avg_cost) / p.avg_cost) * 100
                : 0;
            const up = unreal >= 0;
            const history = state.price_history[p.symbol] ?? [];
            const forecast = state.forecasts?.[p.symbol];
            return (
              <div
                key={p.symbol}
                className="rounded-md border border-border/40 bg-background/40 p-4 space-y-3">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="min-w-[100px]">
                    <div className="font-semibold text-base flex items-center gap-2">
                      {p.symbol}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold ${
                          direction === 'short'
                            ? 'bg-amber-500/15 text-amber-500'
                            : 'bg-emerald-500/15 text-emerald-500'
                        }`}>
                        {direction}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {regionForSymbol(p.symbol)}
                    </div>
                  </div>
                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-xs">
                    <Field label="Qty" value={fmtQty(absQty)} />
                    <Field label="Avg" value={fmtUSD(p.avg_cost)} />
                    <Field
                      label="Last"
                      value={fmtUSD(last)}
                      sub={q ? fmtPct(q.change_pct) : undefined}
                      subTone={
                        q && q.change_pct >= 0 ? 'up' : q ? 'down' : undefined
                      }
                    />
                    <Field
                      label={direction === 'short' ? 'Short exposure' : 'Value'}
                      value={fmtUSD(value)}
                    />
                  </div>
                  <div
                    className={`text-right tabular-nums font-semibold ${
                      up ? 'text-emerald-500' : 'text-red-500'
                    }`}>
                    {fmtUSD(unreal)}
                    <div className="text-[10px]">{fmtPct(pct)}</div>
                  </div>
                </div>
                <PositionChart
                  symbol={p.symbol}
                  points={history}
                  avgCost={p.avg_cost}
                  target={plan?.target_price}
                  stop={plan?.stop_price}
                  forecast={forecast}
                />
                {forecast && forecast.curve.length > 0 && (
                  <ForecastSummary forecast={forecast} basePrice={last} />
                )}
                {plan && (
                  <div className="pt-2 border-t border-border/30 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Plan
                      </span>
                      {plan.target_price > 0 && (
                        <span>
                          <span className="text-muted-foreground">target </span>
                          <span className="text-emerald-500 tabular-nums font-medium">
                            {fmtUSD(plan.target_price)}
                          </span>
                        </span>
                      )}
                      {plan.stop_price > 0 && (
                        <span>
                          <span className="text-muted-foreground">stop </span>
                          <span className="text-red-500 tabular-nums font-medium">
                            {fmtUSD(plan.stop_price)}
                          </span>
                        </span>
                      )}
                      {plan.horizon_min > 0 && (
                        <span>
                          <span className="text-muted-foreground">hold </span>
                          <span className="tabular-nums text-foreground/90">
                            {fmtHorizon(plan.horizon_min)}
                          </span>
                        </span>
                      )}
                      {plan.confidence > 0 && (
                        <span>
                          <span className="text-muted-foreground">conf </span>
                          <span className="tabular-nums text-foreground/90">
                            {(plan.confidence * 100).toFixed(0)}%
                          </span>
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        opened {fmtTimeShort(plan.opened_at)}
                      </span>
                    </div>
                    {plan.thesis && (
                      <div className="rounded-md border border-border/40 bg-background/40 px-2.5 py-2">
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                          Agent note
                        </div>
                        <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap wrap-break-word">
                          {plan.thesis}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  sub,
  subTone,
}: {
  label: string;
  value: string;
  sub?: string;
  subTone?: 'up' | 'down';
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="tabular-nums">{value}</div>
      {sub && (
        <div
          className={`text-[10px] tabular-nums ${
            subTone === 'up'
              ? 'text-emerald-500'
              : subTone === 'down'
                ? 'text-red-500'
                : 'text-muted-foreground'
          }`}>
          {sub}
        </div>
      )}
    </div>
  );
}

function fmtHorizon(min: number): string {
  if (min < 60) return `${min}m`;
  if (min < 60 * 24) {
    const h = min / 60;
    return `${h.toFixed(h < 10 ? 1 : 0)}h`;
  }
  const d = min / (60 * 24);
  return `${d.toFixed(d < 10 ? 1 : 0)}d`;
}

// Larger position chart: full historical line + dotted forecast curve
// + shaded confidence band, with avg-cost / target / stop reference
// lines and a time-axis legend. Replaces the old inline Sparkline.
function PositionChart({
  symbol,
  points,
  avgCost,
  target,
  stop,
  forecast,
}: {
  symbol: string;
  points: TraderPricePoint[];
  avgCost: number;
  target?: number;
  stop?: number;
  forecast?: TraderForecast;
}) {
  const [view, setView] = useState<'live' | 'past'>('live');
  const [pastPoints, setPastPoints] = useState<TraderPricePoint[] | null>(null);
  const [pastErr, setPastErr] = useState<string | null>(null);
  const [pastLoading, setPastLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (view !== 'past') return;
    if (pastPoints !== null) return; // already cached for this symbol
    setPastLoading(true);
    setPastErr(null);
    traderApi
      .bars(symbol, '1Hour')
      .then((res) => {
        if (cancelled) return;
        if (!res || !res.bars) {
          setPastErr('no bars');
          setPastPoints([]);
          return;
        }
        const mapped: TraderPricePoint[] = res.bars.map((b) => ({
          time: b.time,
          price: b.close,
        }));
        setPastPoints(mapped);
      })
      .catch((e) => {
        if (cancelled) return;
        setPastErr(String(e?.message ?? e));
        setPastPoints([]);
      })
      .finally(() => {
        if (!cancelled) setPastLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, symbol, pastPoints]);

  // Reset cached past data if symbol changes (component is re-keyed by
  // parent in practice, but be defensive).
  useEffect(() => {
    setPastPoints(null);
    setView('live');
  }, [symbol]);

  const W = 720;
  const H = 200;
  const padL = 44; // y-axis labels
  const padR = 10;
  const padT = 8;
  const padB = 22; // x-axis labels
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // In Past mode we use bars (no live forecast — bars cover a longer
  // window and the forecast is anchored to live "now").
  const effectivePoints =
    view === 'past' ? pastPoints ?? [] : points;
  // In Live mode we cap the forecast horizon at 30 minutes so the chart
  // stays useful — the full 10h projection visually crushes the recent
  // price action into the left edge. The full-horizon numbers are still
  // shown in ForecastSummary below the chart.
  const LIVE_FORECAST_MS = 30 * 60 * 1000;
  let effectiveForecast: TraderForecast | undefined =
    view === 'past' ? undefined : forecast;
  if (effectiveForecast && view === 'live' && points.length > 0) {
    const liveTLast = new Date(points[points.length - 1].time).getTime();
    const cutoff = liveTLast + LIVE_FORECAST_MS;
    const trimmed = effectiveForecast.curve.filter(
      (c) => new Date(c.time).getTime() <= cutoff,
    );
    if (trimmed.length > 0) {
      effectiveForecast = { ...effectiveForecast, curve: trimmed };
    } else {
      effectiveForecast = undefined;
    }
  }

  const Toolbar = (
    <div className="mb-1 flex items-center justify-between text-[10px]">
      <div className="inline-flex rounded-md border border-border/40 overflow-hidden">
        <button
          type="button"
          onClick={() => setView('live')}
          className={`px-2 py-0.5 ${
            view === 'live'
              ? 'bg-foreground/10 text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}>
          Live
        </button>
        <button
          type="button"
          onClick={() => setView('past')}
          className={`px-2 py-0.5 border-l border-border/40 ${
            view === 'past'
              ? 'bg-foreground/10 text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}>
          Past 1D
        </button>
      </div>
      <span className="text-muted-foreground">
        {view === 'past'
          ? pastLoading
            ? 'loading bars…'
            : pastErr
              ? `bars: ${pastErr}`
              : `${effectivePoints.length} bars`
          : `${effectivePoints.length} samples`}
      </span>
    </div>
  );

  if (effectivePoints.length < 2) {
    return (
      <div className="w-full">
        {Toolbar}
        <div
          className="w-full rounded-md border border-dashed border-border/40 flex items-center justify-center text-xs text-muted-foreground"
          style={{ height: H }}>
          {view === 'past'
            ? pastLoading
              ? 'Loading historical bars…'
              : pastErr
                ? `Historical bars unavailable (${pastErr}). Alpaca live broker required.`
                : 'No historical bars for this symbol.'
            : 'Building price history… (next quote refresh in ~10s)'}
        </div>
      </div>
    );
  }

  // Time axis spans the historical window AND the forecast horizon.
  const histTimes = effectivePoints.map((p) => new Date(p.time).getTime());
  const t0 = histTimes[0];
  const tLast = histTimes[histTimes.length - 1];
  const forecastTimes =
    effectiveForecast?.curve?.map((p) => new Date(p.time).getTime()) ?? [];
  const tEnd = forecastTimes.length
    ? Math.max(tLast, forecastTimes[forecastTimes.length - 1])
    : tLast;

  // Y axis spans history + forecast band + reference lines.
  const histYs = effectivePoints.map((p) => p.price);
  const fYs: number[] = [];
  if (effectiveForecast) {
    for (const c of effectiveForecast.curve) {
      fYs.push(c.lower, c.upper, c.price);
    }
  }
  const refs = [avgCost, target ?? 0, stop ?? 0].filter((v) => v > 0);
  const lo = Math.min(...histYs, ...fYs, ...refs);
  const hi = Math.max(...histYs, ...fYs, ...refs);
  const pad = Math.max(0.0001, (hi - lo) * 0.08);
  const ymin = lo - pad;
  const ymax = hi + pad;

  const sx = (t: number) =>
    padL + ((t - t0) / Math.max(1, tEnd - t0)) * innerW;
  const sy = (y: number) =>
    padT + innerH - ((y - ymin) / (ymax - ymin)) * innerH;

  // Historical line.
  const histPath = effectivePoints
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${sx(histTimes[i]).toFixed(1)},${sy(p.price).toFixed(1)}`,
    )
    .join(' ');
  const lastPrice = effectivePoints[effectivePoints.length - 1].price;
  const histStroke = lastPrice >= effectivePoints[0].price ? '#10b981' : '#ef4444';

  // Forecast central path (dotted) + confidence band (filled polygon).
  let fPath = '';
  let bandPath = '';
  if (effectiveForecast && effectiveForecast.curve.length > 0) {
    // Anchor the projected line at the most recent real sample so it
    // visually continues from the history without a gap.
    const anchor = `M${sx(tLast).toFixed(1)},${sy(lastPrice).toFixed(1)}`;
    fPath =
      anchor +
      ' ' +
      effectiveForecast.curve
        .map(
          (p) =>
            `L${sx(new Date(p.time).getTime()).toFixed(1)},${sy(p.price).toFixed(1)}`,
        )
        .join(' ');
    const upperPts = effectiveForecast.curve.map(
      (p) => `${sx(new Date(p.time).getTime()).toFixed(1)},${sy(p.upper).toFixed(1)}`,
    );
    const lowerPts = effectiveForecast.curve
      .slice()
      .reverse()
      .map(
        (p) => `${sx(new Date(p.time).getTime()).toFixed(1)},${sy(p.lower).toFixed(1)}`,
      );
    // Start band at the anchor too so it visually grows out of the
    // last real sample.
    bandPath =
      `M${sx(tLast).toFixed(1)},${sy(lastPrice).toFixed(1)} ` +
      `L${upperPts.join(' L')} L${lowerPts.join(' L')} Z`;
  }

  // Y ticks: 4 evenly spaced.
  const yTicks = [0, 1, 2, 3].map((i) => ymin + ((ymax - ymin) * i) / 3);

  // X ticks: now / 6 evenly spaced labels including the forecast end.
  const xTicks = [0, 1, 2, 3, 4].map((i) => t0 + ((tEnd - t0) * i) / 4);

  const fmtTime = (ms: number) => {
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const directionTone =
    effectiveForecast?.direction === 'up'
      ? 'text-emerald-500'
      : effectiveForecast?.direction === 'down'
        ? 'text-red-500'
        : 'text-muted-foreground';

  return (
    <div className="w-full">
      {Toolbar}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        preserveAspectRatio="none">
        {/* Y grid + labels */}
        {yTicks.map((y, i) => (
          <g key={`y${i}`}>
            <line
              x1={padL}
              x2={W - padR}
              y1={sy(y)}
              y2={sy(y)}
              stroke="currentColor"
              className="text-border/40"
              strokeWidth={0.5}
            />
            <text
              x={padL - 4}
              y={sy(y) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize={9}>
              ${y.toFixed(y >= 1000 ? 0 : 2)}
            </text>
          </g>
        ))}
        {/* X tick labels */}
        {xTicks.map((t, i) => (
          <text
            key={`x${i}`}
            x={sx(t)}
            y={H - 6}
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            className="fill-muted-foreground"
            fontSize={9}>
            {fmtTime(t)}
          </text>
        ))}
        {/* Vertical "now" divider */}
        {effectiveForecast && (
          <line
            x1={sx(tLast)}
            x2={sx(tLast)}
            y1={padT}
            y2={padT + innerH}
            stroke="currentColor"
            className="text-muted-foreground/50"
            strokeDasharray="2 2"
            strokeWidth={0.8}
          />
        )}
        {/* Reference lines */}
        {avgCost > 0 && (
          <g>
            <line
              x1={padL}
              x2={W - padR}
              y1={sy(avgCost)}
              y2={sy(avgCost)}
              stroke="currentColor"
              className="text-muted-foreground/70"
              strokeDasharray="3 3"
              strokeWidth={0.8}
            />
            <text
              x={W - padR - 2}
              y={sy(avgCost) - 2}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize={9}>
              avg
            </text>
          </g>
        )}
        {target && target > 0 && (
          <g>
            <line
              x1={padL}
              x2={W - padR}
              y1={sy(target)}
              y2={sy(target)}
              stroke="#10b981"
              strokeDasharray="2 3"
              strokeWidth={0.8}
              opacity={0.7}
            />
            <text
              x={W - padR - 2}
              y={sy(target) - 2}
              textAnchor="end"
              fill="#10b981"
              fontSize={9}>
              target
            </text>
          </g>
        )}
        {stop && stop > 0 && (
          <g>
            <line
              x1={padL}
              x2={W - padR}
              y1={sy(stop)}
              y2={sy(stop)}
              stroke="#ef4444"
              strokeDasharray="2 3"
              strokeWidth={0.8}
              opacity={0.7}
            />
            <text
              x={W - padR - 2}
              y={sy(stop) - 2}
              textAnchor="end"
              fill="#ef4444"
              fontSize={9}>
              stop
            </text>
          </g>
        )}
        {/* Forecast confidence band */}
        {bandPath && (
          <path
            d={bandPath}
            fill="#6366f1"
            opacity={0.12}
            stroke="none"
          />
        )}
        {/* Forecast central line */}
        {fPath && (
          <path
            d={fPath}
            fill="none"
            stroke="#6366f1"
            strokeWidth={1.4}
            strokeDasharray="4 3"
            opacity={0.85}
          />
        )}
        {/* Historical price */}
        <path d={histPath} fill="none" stroke={histStroke} strokeWidth={1.6} />
      </svg>
      {effectiveForecast && (
        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground px-1">
          <span>
            <span
              className="inline-block w-2 h-0.5 align-middle mr-1"
              style={{ background: histStroke }}
            />
            history ({effectivePoints.length} pts)
          </span>
          <span className={directionTone}>
            <span
              className="inline-block w-2 h-0.5 align-middle mr-1"
              style={{
                borderTop: '1.5px dashed #6366f1',
                background: 'transparent',
              }}
            />
            forecast {view === 'live' ? '30m' : `${effectiveForecast.horizon_h.toFixed(0)}h`} · {effectiveForecast.direction}
          </span>
        </div>
      )}
    </div>
  );
}

// Compact pair of cards summarising the +5h / +10h prediction beneath
// the chart: central price, % move vs current, and 1σ confidence band.
function ForecastSummary({
  forecast,
  basePrice,
}: {
  forecast: TraderForecast;
  basePrice: number;
}) {
  const tone = (delta: number) =>
    delta > 0
      ? 'text-emerald-500'
      : delta < 0
        ? 'text-red-500'
        : 'text-muted-foreground';
  const Box = ({
    label,
    snap,
  }: {
    label: string;
    snap: TraderForecast['snap_5h'];
  }) => {
    const delta = basePrice > 0 ? ((snap.price - basePrice) / basePrice) * 100 : 0;
    return (
      <div className="flex-1 rounded-md border border-border/40 bg-background/40 p-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-sm font-semibold tabular-nums">
            {fmtUSD(snap.price)}
          </span>
          <span className={`text-[11px] tabular-nums ${tone(delta)}`}>
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(2)}%
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          band {fmtUSD(snap.lower)} – {fmtUSD(snap.upper)}
        </div>
      </div>
    );
  };
  return (
    <div className="flex gap-2">
      <Box label="Forecast +5h" snap={forecast.snap_5h} />
      <Box label="Forecast +10h" snap={forecast.snap_10h} />
      <div className="flex-1 rounded-md border border-border/40 bg-background/40 p-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Model
        </div>
        <div className="text-[11px] mt-0.5 tabular-nums">
          drift {forecast.slope_per_h >= 0 ? '+' : ''}
          {forecast.slope_per_h.toFixed(3)}/h
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          1σ {(forecast.sigma_pct * 100).toFixed(2)}%/√h · conf{' '}
          {(forecast.confidence * 100).toFixed(0)}%
        </div>
      </div>
    </div>
  );
}


// ─── Agent log ──────────────────────────────────────────────────────────────

// ─── Decision reports (sidebar list) + pipeline modal ─────────────────────

// Aggregate risk for a tick = max risk across its non-hold decisions.
// (We use max because one reckless trade dominates the risk profile of the
// tick — averaging hides outliers.)
function tickRisk(log: TraderAgentLog): number {
  let r = 0;
  for (const d of log.decisions ?? []) {
    if (d.action === 'hold') continue;
    if ((d.risk ?? 0) > r) r = d.risk ?? 0;
  }
  return r;
}

function riskLabel(r: number): { label: string; cls: string } {
  if (r >= 0.7) return { label: 'high', cls: 'bg-red-500/15 text-red-500' };
  if (r >= 0.4)
    return { label: 'med', cls: 'bg-amber-500/15 text-amber-500' };
  if (r > 0) return { label: 'low', cls: 'bg-emerald-500/15 text-emerald-500' };
  return { label: '—', cls: 'bg-muted text-muted-foreground' };
}

function DecisionReportsCard({
  logs,
  state,
}: {
  logs: TraderAgentLog[];
  state: TraderState;
}) {
  const reversed = useMemo(() => [...logs].reverse(), [logs]);
  const decisionStats = useMemo(() => {
    let acted = 0;
    let executed = 0;
    let rejected = 0;
    let hold = 0;
    for (const log of logs) {
      for (const d of log.decisions ?? []) {
        if (d.action === 'hold') {
          hold++;
          continue;
        }
        acted++;
        if (d.executed) executed++;
        if (d.rejected) rejected++;
      }
    }
    const executionRate = acted > 0 ? (executed / acted) * 100 : 0;
    return { acted, executed, rejected, hold, executionRate };
  }, [logs]);
  const [openLog, setOpenLog] = useState<TraderAgentLog | null>(null);
  return (
    <>
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm h-full flex flex-col">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <HistoryIcon size={15} /> Decision reports
          </h2>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {reversed.length} ticks · click for full pipeline
          </span>
        </header>
        <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <PipelineStat label="Acted decisions" value={String(decisionStats.acted)} />
          <PipelineStat
            label="Executed"
            value={`${decisionStats.executed} (${decisionStats.executionRate.toFixed(1)}%)`}
          />
          <PipelineStat label="Rejected" value={String(decisionStats.rejected)} />
          <PipelineStat label="Hold calls" value={String(decisionStats.hold)} />
        </div>
        {reversed.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            The agent has not run yet. Press Start to begin — each tick produces
            a report you can open.
          </div>
        ) : (
          <ol className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
            {reversed.slice(0, 100).map((log) => {
              const acts = (log.decisions ?? []).filter(
                (d) => d.action !== 'hold',
              );
              const exec = acts.filter((d) => d.executed).length;
              const risk = tickRisk(log);
              const r = riskLabel(risk);
              const hasErr = !!log.error;
              return (
                <li key={log.id}>
                  <button
                    type="button"
                    onClick={() => setOpenLog(log)}
                    className="w-full text-left rounded-md border border-border/40 bg-background/40 p-2.5 hover:border-border hover:bg-accent/30 transition-colors">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                      <span className="tabular-nums">
                        {fmtTimeShort(log.time)}
                      </span>
                      {log.latency_ms != null && (
                        <span className="opacity-60">
                          · {(log.latency_ms / 1000).toFixed(1)}s
                        </span>
                      )}
                      <span
                        className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold normal-case tracking-normal ${r.cls}`}>
                        risk {r.label}
                        {risk > 0 && (
                          <span className="ml-1 opacity-70 tabular-nums">
                            {(risk * 100).toFixed(0)}
                          </span>
                        )}
                      </span>
                    </div>
                    {log.summary && (
                      <div className="mt-1 text-xs text-foreground/90 italic line-clamp-2">
                        "{log.summary}"
                      </div>
                    )}
                    {hasErr ? (
                      <div className="mt-1 text-[11px] text-red-500 line-clamp-2">
                        {log.error}
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="rounded bg-emerald-500/15 text-emerald-500 px-1.5 py-0.5">
                          {acts.filter((d) => d.action === 'buy').length} buy
                        </span>
                        <span className="rounded bg-red-500/15 text-red-500 px-1.5 py-0.5">
                          {acts.filter((d) => d.action === 'sell').length} sell
                        </span>
                        <span className="rounded bg-muted text-muted-foreground px-1.5 py-0.5">
                          {(log.decisions ?? []).length - acts.length} hold
                        </span>
                        {acts.length > 0 && (
                          <span className="text-muted-foreground ml-auto">
                            {exec}/{acts.length} executed
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      {openLog && (
        <PipelineModal
          log={openLog}
          state={state}
          onClose={() => setOpenLog(null)}
        />
      )}
    </>
  );
}

// PipelineModal — full read-out of one tick. Shows model, latency, the memo
// the agent wrote that tick (its narrative), the news headlines that were in
// front of it, and every decision with full plan + risk + execution outcome.
function PipelineModal({
  log,
  state,
  onClose,
}: {
  log: TraderAgentLog;
  state: TraderState;
  onClose: () => void;
}) {
  // Close on ESC. Body scroll lock while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const decisions = log.decisions ?? [];
  const acts = decisions.filter((d) => d.action !== 'hold');
  const executed = acts.filter((d) => d.executed);
  const rejected = acts.filter((d) => d.rejected);
  const risk = tickRisk(log);
  const r = riskLabel(risk);
  const tickTime = new Date(log.time).getTime();
  // News from THIS tick: rough heuristic — news with published time within
  // 30 min before the tick. We just take all current news as a proxy if
  // we can't filter (state.news is "latest", not historical).
  const news = state.news.slice(0, 40);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl my-8"
        onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Tick pipeline
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {fmtTime(log.time)}
            </h2>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {log.model && <span>model: {log.model}</span>}
              {log.latency_ms != null && (
                <span>latency: {(log.latency_ms / 1000).toFixed(2)}s</span>
              )}
              <span>
                decisions: {decisions.length} · acted: {acts.length} · executed:{' '}
                {executed.length} · rejected: {rejected.length}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`px-2 py-1 rounded text-xs font-semibold ${r.cls}`}>
              tick risk: {r.label}
              {risk > 0 && (
                <span className="ml-1 opacity-70 tabular-nums">
                  {(risk * 100).toFixed(0)}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-xl leading-none px-2">
              ✕
            </button>
          </div>
        </header>

        <div className="px-6 py-5 space-y-5">
          {log.error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-sm p-3 flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">LLM call failed</div>
                <div className="text-xs">{log.error}</div>
              </div>
            </div>
          )}

          <PipelineSection
            num="1"
            title="Inputs"
            subtitle="What the agent saw at the start of this tick">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <PipelineStat label="Watchlist" value={String(state.watchlist.length)} />
              <PipelineStat
                label="Quotes refreshed"
                value={String(state.quotes.length)}
              />
              <PipelineStat
                label="News headlines"
                value={String(news.length)}
              />
              <PipelineStat
                label="Open positions"
                value={String(state.positions.length)}
              />
            </div>
          </PipelineSection>

          {log.conversation && log.conversation.length > 0 && (
            <PipelineSection
              num="2"
              title={`Meeting transcript (${log.conversation.length} speakers)`}
              subtitle="Five LLM roles discuss this tick before any trade is placed">
              <ConversationThread turns={log.conversation} />
            </PipelineSection>
          )}

          {log.summary && (
            <PipelineSection
              num={log.conversation?.length ? '3' : '2'}
              title="Agent stance"
              subtitle="One-line summary of how the model is reading the tape">
              <div className="text-sm text-foreground/90 italic">
                <ChatMarkdown text={log.summary} />
              </div>
            </PipelineSection>
          )}

          <PipelineSection
            num={
              log.conversation?.length
                ? log.summary
                  ? '4'
                  : '3'
                : log.summary
                  ? '3'
                  : '2'
            }
            title={`Decisions (${decisions.length})`}
            subtitle="Per-symbol output, with plan & risk">
            {decisions.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                No decisions returned.
              </div>
            ) : (
              <div className="space-y-2">
                {decisions
                  .slice()
                  .sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0))
                  .map((d, idx) => (
                    <DecisionRow key={`${log.id}-${idx}`} d={d} />
                  ))}
              </div>
            )}
          </PipelineSection>

          {news.length > 0 && (
            <PipelineSection
              num={
                log.conversation?.length
                  ? log.summary
                    ? '5'
                    : '4'
                  : log.summary
                    ? '4'
                    : '3'
              }
              title="News fed to the model"
              subtitle="Headlines available when this tick ran">
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {news.map((n, idx) => {
                  const dt = new Date(n.published).getTime();
                  const dh = isFinite(dt)
                    ? Math.round((tickTime - dt) / 60000)
                    : 0;
                  return (
                    <a
                      key={`${n.link}-${idx}`}
                      href={n.link}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded border border-border/40 bg-background/40 px-2 py-1.5 hover:bg-accent/40 text-xs">
                      <span className="font-medium text-foreground/80">
                        {n.symbol}
                      </span>{' '}
                      <span className="text-foreground/90">{n.title}</span>
                      <span className="ml-2 text-muted-foreground text-[10px]">
                        {dh > 0 ? `${dh}m before tick` : 'after tick'}
                      </span>
                    </a>
                  );
                })}
              </div>
            </PipelineSection>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Meeting transcript ─────────────────────────────────────────────────────

const ROLE_META: Record<
  string,
  { name: string; initials: string; cls: string; bubble: string }
> = {
  account: {
    name: 'Owen · Account Manager',
    initials: 'OW',
    cls: 'bg-slate-400/15 text-slate-300 border-slate-400/30',
    bubble: 'bg-slate-400/5 border-slate-400/20',
  },
  reporter: {
    name: 'Lana · News Reporter',
    initials: 'LN',
    cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    bubble: 'bg-amber-500/5 border-amber-500/20',
  },
  analyst: {
    name: 'Raj · Market Analyst',
    initials: 'RJ',
    cls: 'bg-sky-500/15 text-sky-500 border-sky-500/30',
    bubble: 'bg-sky-500/5 border-sky-500/20',
  },
  risk: {
    name: 'Mira · Risk Manager',
    initials: 'MR',
    cls: 'bg-rose-500/15 text-rose-500 border-rose-500/30',
    bubble: 'bg-rose-500/5 border-rose-500/20',
  },
  trader: {
    name: 'Kenji · Trader',
    initials: 'KJ',
    cls: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    bubble: 'bg-emerald-500/5 border-emerald-500/20',
  },
  manager: {
    name: 'Sofia · Portfolio Manager',
    initials: 'SF',
    cls: 'bg-indigo-500/15 text-indigo-500 border-indigo-500/30',
    bubble: 'bg-indigo-500/5 border-indigo-500/20',
  },
  allocator: {
    name: 'Mason · Capital Allocator',
    initials: 'MA',
    cls: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
    bubble: 'bg-teal-500/5 border-teal-500/20',
  },
  executor: {
    name: 'Executor · JSON',
    initials: 'EX',
    cls: 'bg-violet-500/15 text-violet-500 border-violet-500/30',
    bubble: 'bg-violet-500/5 border-violet-500/20',
  },
  // Domain experts — only appear when their sector is in play.
  tech_expert: {
    name: 'Diane · Tech Expert',
    initials: 'DI',
    cls: 'bg-cyan-500/15 text-cyan-500 border-cyan-500/30',
    bubble: 'bg-cyan-500/5 border-cyan-500/20',
  },
  energy_expert: {
    name: 'Marcus · Energy Expert',
    initials: 'MC',
    cls: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
    bubble: 'bg-orange-500/5 border-orange-500/20',
  },
  auto_expert: {
    name: 'Sora · Auto / EV Expert',
    initials: 'SR',
    cls: 'bg-red-500/15 text-red-500 border-red-500/30',
    bubble: 'bg-red-500/5 border-red-500/20',
  },
  finance_expert: {
    name: 'Imani · Banks Expert',
    initials: 'IM',
    cls: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
    bubble: 'bg-blue-500/5 border-blue-500/20',
  },
  crypto_expert: {
    name: 'Kai · Crypto Expert',
    initials: 'KA',
    cls: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30',
    bubble: 'bg-yellow-500/5 border-yellow-500/20',
  },
  geo_expert: {
    name: 'Hassan · Geopolitics Expert',
    initials: 'HS',
    cls: 'bg-stone-400/15 text-stone-300 border-stone-400/30',
    bubble: 'bg-stone-400/5 border-stone-400/20',
  },
  health_expert: {
    name: 'Priya · Healthcare Expert',
    initials: 'PR',
    cls: 'bg-pink-500/15 text-pink-500 border-pink-500/30',
    bubble: 'bg-pink-500/5 border-pink-500/20',
  },
  consumer_expert: {
    name: 'Wei · Consumer Expert',
    initials: 'WE',
    cls: 'bg-lime-500/15 text-lime-500 border-lime-500/30',
    bubble: 'bg-lime-500/5 border-lime-500/20',
  },
};

// ─── Live discussion sidebar ───────────────────────────────────────────────

// Slides in from the right while a tick is running and pipes each panel
// turn into a chat thread the operator can watch in real time. Auto-
// dismisses when the tick finishes (the backend clears
// tick_status.conversation as part of setPhase("done")).
function LiveDiscussionSidebar({ status }: { status: TraderTickStatus }) {
  const [forceClosed, setForceClosed] = useState(false);
  const turns = status.conversation ?? [];
  const live = !!status.active && turns.length > 0;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Reset the user-dismiss flag whenever a new tick starts so a future
  // meeting will reopen the panel automatically.
  useEffect(() => {
    if (!status.active) setForceClosed(false);
  }, [status.active]);

  // Autoscroll to the latest turn.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length]);

  if (!live || forceClosed) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 z-40 w-full sm:w-[440px] bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      <header className="px-4 py-3 border-b border-border flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">
            Meeting in progress
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {status.phase || '…'} · {turns.length} turn{turns.length === 1 ? '' : 's'}
          </div>
        </div>
        <button
          className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 rounded hover:bg-muted/40"
          onClick={() => setForceClosed(true)}
          title="Hide (will reopen on next tick)">
          ✕
        </button>
      </header>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <ConversationThread turns={turns as TraderConversationTurn[]} />
      </div>
    </div>
  );
}

function ConversationThread({ turns }: { turns: TraderConversationTurn[] }) {
  return (
    <div className="space-y-3">
      {turns.map((t, idx) => {
        const meta = ROLE_META[t.role] ?? {
          name: t.role,
          initials: t.role.slice(0, 2).toUpperCase(),
          cls: 'bg-muted text-muted-foreground border-border',
          bubble: 'bg-background/40 border-border/40',
        };
        const isExecutor = t.role === 'executor';
        return (
          <div key={idx} className="flex gap-2.5">
            <div
              className={`shrink-0 h-8 w-8 rounded-full border flex items-center justify-center text-[10px] font-semibold ${meta.cls}`}
              title={meta.name}>
              {meta.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-[11px] font-semibold text-foreground">
                  {meta.name}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {fmtTimeShort(t.time)}
                </span>
                {t.latency_ms != null && (
                  <span className="text-[10px] text-muted-foreground opacity-70">
                    {(t.latency_ms / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
              <div
                className={`rounded-lg border px-3 py-2 ${meta.bubble} ${
                  isExecutor
                    ? 'font-mono text-[10px] whitespace-pre-wrap break-words'
                    : 'text-xs break-words'
                } text-foreground/90`}>
                {isExecutor ? (
                  <details>
                    <summary className="cursor-pointer text-[11px] font-sans not-italic text-muted-foreground hover:text-foreground select-none">
                      Show JSON action plan ({t.content.length} chars)
                    </summary>
                    <pre className="mt-2 overflow-x-auto">{t.content}</pre>
                  </details>
                ) : (
                  <ChatMarkdown text={t.content} />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PipelineSection({
  num,
  title,
  subtitle,
  children,
}: {
  num: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <header className="flex items-baseline gap-2 mb-2">
        <span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold px-1.5">
          {num}
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && (
          <span className="text-[11px] text-muted-foreground">{subtitle}</span>
        )}
      </header>
      <div className="pl-7">{children}</div>
    </section>
  );
}

function PipelineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="text-sm tabular-nums">{value}</div>
    </div>
  );
}

function DecisionRow({ d }: { d: TraderDecision }) {
  const r = riskLabel(d.risk ?? 0);
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-block w-14 text-center font-semibold rounded px-1 py-0.5 text-xs uppercase ${
            d.action === 'buy'
              ? 'bg-emerald-500/15 text-emerald-500'
              : d.action === 'sell'
                ? 'bg-red-500/15 text-red-500'
                : 'bg-muted text-muted-foreground'
          }`}>
          {d.action}
        </span>
        <span className="font-semibold tabular-nums">{d.symbol}</span>
        {d.qty != null && d.qty > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            qty {fmtQty(d.qty)}
          </span>
        )}
        {(d.action === 'buy' || (d.risk ?? 0) > 0) && (
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${r.cls}`}>
            risk {r.label}
            {d.risk != null && d.risk > 0 && (
              <span className="ml-1 opacity-70 tabular-nums">
                {(d.risk * 100).toFixed(0)}
              </span>
            )}
          </span>
        )}
        {d.confidence != null && d.confidence > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            conf {(d.confidence * 100).toFixed(0)}%
          </span>
        )}
        <span className="ml-auto">
          {d.executed ? (
            <span className="text-emerald-500 text-xs">✓ executed</span>
          ) : d.rejected ? (
            <span
              className="text-amber-500 text-xs"
              title={d.rejected}>
              ⚠ rejected
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">held</span>
          )}
        </span>
      </div>
      {d.reason && (
        <div className="text-xs text-foreground/80">
          <ChatMarkdown text={d.reason} />
        </div>
      )}
      {(d.target_price || d.stop_price || d.horizon_min) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] pt-1 border-t border-border/30">
          {d.target_price != null && d.target_price > 0 && (
            <span>
              <span className="text-muted-foreground">target </span>
              <span className="text-emerald-500 tabular-nums">
                {fmtUSD(d.target_price)}
              </span>
            </span>
          )}
          {d.stop_price != null && d.stop_price > 0 && (
            <span>
              <span className="text-muted-foreground">stop </span>
              <span className="text-red-500 tabular-nums">
                {fmtUSD(d.stop_price)}
              </span>
            </span>
          )}
          {d.horizon_min != null && d.horizon_min > 0 && (
            <span>
              <span className="text-muted-foreground">hold </span>
              <span className="tabular-nums">{fmtHorizon(d.horizon_min)}</span>
            </span>
          )}
        </div>
      )}
      {d.rejected && (
        <div className="text-[11px] text-amber-500/90">
		  execution rejected: {d.rejected}
        </div>
      )}
    </div>
  );
}

// ─── News ───────────────────────────────────────────────────────────────────

function NewsCard({ news }: { news: TraderNews[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Newspaper size={15} /> Market headlines
      </h2>
      {news.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          News will appear here once the agent runs its first tick.
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {news.slice(0, 40).map((n, idx) => (
            <a
              key={`${n.link}-${idx}`}
              href={n.link}
              target="_blank"
              rel="noreferrer"
              className="block rounded-md border border-border/40 bg-background/40 p-2.5 hover:bg-accent/40 transition-colors">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                <span className="font-semibold text-foreground/80">
                  {n.symbol}
                </span>
                <span>·</span>
                <span>{fmtTimeShort(n.published)}</span>
                <ExternalLink size={10} className="ml-auto" />
              </div>
              <div className="text-xs text-foreground mt-1">{n.title}</div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Broker settings (Alpaca) ───────────────────────────────────────────────

function BrokerSettingsCard({ onChanged }: { onChanged: () => void }) {
  const [cfg, setCfg] = useState<{
    enabled: boolean;
    name: string;
    key_id: string;
    secret: string; // masked when loaded from server
    base_url: string;
  } | null>(null);
  const [keyId, setKeyId] = useState('');
  const [secret, setSecret] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://paper-api.alpaca.markets');
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const c = await traderApi.alpacaGet();
    if (c) {
      setCfg(c);
      if (c.enabled) {
        setKeyId(c.key_id);
        setBaseUrl(c.base_url || 'https://paper-api.alpaca.markets');
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (
    label: string,
    fn: () => Promise<unknown>,
    successMsg?: string,
  ) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fn();
      if (successMsg) setMsg(successMsg);
      else setMsg(`${label}: ok`);
      await load();
      onChanged();
      return r;
    } catch (e) {
      setErr(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const onTest = () =>
    run(
      'Test',
      async () => {
        const r = await traderApi.alpacaTest({
          key_id: keyId,
          secret,
          base_url: baseUrl,
        });
        const eq = parseFloat(r.equity || '0');
        const bp = parseFloat(r.buying_power || '0');
        setMsg(
          `Connected to ${r.account_id?.slice(0, 8)}… (${r.status}) — equity $${eq.toLocaleString()} · buying power $${bp.toLocaleString()}`,
        );
      },
    );

  const onSave = () =>
    run(
      'Save',
      () =>
        traderApi.alpacaSave({
          key_id: keyId,
          secret,
          base_url: baseUrl,
        }),
      'Saved. The trader is now routing through Alpaca.',
    );

  const onDisconnect = () => {
    if (
      !window.confirm(
        'Disconnect Alpaca? Trades will go back to fully simulated. Open positions in Alpaca are NOT closed by this — only the link is removed.',
      )
    )
      return;
    run('Disconnect', traderApi.alpacaClear, 'Disconnected.').then(() => {
      setKeyId('');
      setSecret('');
    });
  };

  const isConnected = cfg?.enabled === true;

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <header
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}>
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Plug size={15} /> Broker settings
          {isConnected ? (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              <CheckCircle2 size={10} /> {cfg?.name || 'connected'}
            </span>
          ) : (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              not connected
            </span>
          )}
        </h2>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </header>

      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Connect to{' '}
            <a
              href="https://app.alpaca.markets/paper/dashboard/overview"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground">
              Alpaca paper trading
            </a>{' '}
            so the agent's trades fill against real market data instead of
            being simulated. Generate API keys in the right sidebar of the
            paper dashboard ("Your API Keys" → Generate). Keys are stored on
            the server in <code>trader.json</code>; the secret is masked
            everywhere except in the form below.
          </p>

          {isConnected && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
              <div className="font-medium text-foreground flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-emerald-500" />
                Currently connected
              </div>
              <div className="mt-1 text-muted-foreground tabular-nums">
                key: <span className="font-mono">{cfg?.key_id}</span>
                {cfg?.secret && (
                  <>
                    {' · '}secret:{' '}
                    <span className="font-mono">{cfg.secret}</span>
                  </>
                )}
                {cfg?.base_url && (
                  <>
                    {' · '}endpoint:{' '}
                    <span className="font-mono">{cfg.base_url}</span>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                API Key ID
              </label>
              <Input
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
                placeholder="PKxxxxxxxxxxxxxxxxxx"
                className="mt-1 font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                API Secret
              </label>
              <div className="mt-1 relative">
                <Input
                  type={showSecret ? 'text' : 'password'}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="enter secret to update"
                  className="font-mono text-xs pr-9"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}>
                  {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Endpoint
              </label>
              <select
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs">
                <option value="https://paper-api.alpaca.markets">
                  Paper trading — https://paper-api.alpaca.markets (recommended)
                </option>
                <option value="https://api.alpaca.markets">
                  ⚠ LIVE trading — https://api.alpaca.markets (real money)
                </option>
              </select>
              {baseUrl === 'https://api.alpaca.markets' && (
                <div className="mt-1 text-[11px] text-destructive">
                  Live endpoint selected. Orders submitted by the agent will
                  use real money.
                </div>
              )}
            </div>
          </div>

          {msg && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
              {msg}
            </div>
          )}
          {err && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {err}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !keyId || !secret}
              onClick={onTest}>
              Test connection
            </Button>
            <Button
              size="sm"
              disabled={busy || !keyId || !secret}
              onClick={onSave}>
              Save & connect
            </Button>
            {isConnected && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={onDisconnect}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto">
                <Trash2 size={13} className="mr-1.5" />
                Disconnect
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Watchlist ──────────────────────────────────────────────────────────────

function WatchlistCard(props: {
  state: TraderState;
  busy: boolean;
  onSave: (symbols: string[], intervalMin: number) => void;
}) {
  const { state, busy } = props;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [symbolsInput, setSymbolsInput] = useState(state.watchlist.join(', '));
  const [intervalInput, setIntervalInput] = useState(String(state.interval_min));

  useEffect(() => {
    setSymbolsInput(state.watchlist.join(', '));
    setIntervalInput(String(state.interval_min));
  }, [state.watchlist, state.interval_min]);

  const quoteBySymbol = new Map(state.quotes.map((q) => [q.symbol, q]));

  const grouped = useMemo(() => {
    const m = new Map<string, string[]>();
    state.watchlist.forEach((s) => {
      const r = regionForSymbol(s);
      const arr = m.get(r) ?? [];
      arr.push(s);
      m.set(r, arr);
    });
    const out: { region: string; symbols: string[] }[] = [];
    REGION_ORDER.forEach((r) => {
      if (m.has(r)) out.push({ region: r, symbols: m.get(r)! });
    });
    m.forEach((symbols, region) => {
      if (!REGION_ORDER.includes(region)) out.push({ region, symbols });
    });
    return out;
  }, [state.watchlist]);

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <button
        className="w-full flex items-center justify-between px-5 py-3 text-left"
        onClick={() => setOpen((v) => !v)}>
        <span className="text-sm font-semibold text-foreground flex items-center gap-2">
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <Globe size={15} /> Watchlist · {state.watchlist.length} symbols across{' '}
          {grouped.length} regions
        </span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          tick every {state.interval_min}m
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-border/40 pt-4">
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">
                  Symbols (Yahoo tickers — use .L .DE .T .HK .IS etc. for non-US)
                </label>
                <textarea
                  value={symbolsInput}
                  onChange={(e) => setSymbolsInput(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono"
                />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div>
                  <label className="text-xs text-muted-foreground">
                    Tick interval (minutes)
                  </label>
                  <Input
                    type="number"
                    value={intervalInput}
                    min={1}
                    onChange={(e) => setIntervalInput(e.target.value)}
                    className="w-32"
                  />
                </div>
                <div className="flex-1" />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setSymbolsInput(state.watchlist.join(', '));
                    setIntervalInput(String(state.interval_min));
                  }}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    const symbols = symbolsInput
                      .split(/[,\s]+/)
                      .map((s) => s.trim().toUpperCase())
                      .filter(Boolean);
                    const interval = Math.max(1, Number(intervalInput) || 1);
                    props.onSave(symbols, interval);
                    setEditing(false);
                  }}>
                  Save
                </Button>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                  Presets
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {WATCHLIST_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className="text-[11px] px-2 py-1 rounded-md border border-border hover:bg-accent/40"
                      onClick={() => setSymbolsInput(p.symbols.join(', '))}>
                      {p.label}{' '}
                      <span className="text-muted-foreground">
                        ({p.symbols.length})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-end -mt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(true)}>
                  <Settings size={13} className="mr-1.5" /> Edit
                </Button>
              </div>
              {grouped.map(({ region, symbols }) => (
                <div key={region}>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                    {region} · {symbols.length}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {symbols.map((sym) => (
                      <MiniQuote
                        key={sym}
                        symbol={sym}
                        quote={quoteBySymbol.get(sym)}
                        position={state.positions.find(
                          (p) => p.symbol === sym,
                        )}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function MiniQuote({
  symbol,
  quote,
  position,
}: {
  symbol: string;
  quote?: TraderQuote;
  position?: TraderPosition;
}) {
  const isUp = (quote?.change_pct ?? 0) >= 0;
  return (
    <div
      className={`rounded-md border bg-background/40 p-2 text-xs ${
        position ? 'border-emerald-500/40' : 'border-border/40'
      }`}>
      <div className="flex items-center justify-between">
        <span className="font-medium truncate">{symbol}</span>
        {position && (
          <span className="text-[9px] uppercase tracking-widest text-emerald-500">
            held
          </span>
        )}
      </div>
      <div className="tabular-nums">
        {quote?.price ? fmtUSD(quote.price) : '—'}
      </div>
      <div
        className={`text-[10px] tabular-nums ${
          isUp ? 'text-emerald-500' : 'text-red-500'
        }`}>
        {quote ? fmtPct(quote.change_pct) : ''}
      </div>
    </div>
  );
}

// ─── Trades ─────────────────────────────────────────────────────────────────

function TradesCard({ trades }: { trades: TraderTrade[] }) {
  const [open, setOpen] = useState(false);
  const reversed = useMemo(() => [...trades].reverse(), [trades]);
  const perf = useMemo(() => {
    const closed = trades.filter((t) => t.realised != null);
    const netPL = closed.reduce((sum, t) => sum + (t.realised ?? 0), 0);
    const wins = closed.filter((t) => (t.realised ?? 0) > 0).length;
    const losses = closed.filter((t) => (t.realised ?? 0) < 0).length;
    const settled = wins + losses;
    const successRate = settled > 0 ? (wins / settled) * 100 : 0;
    const avgClosed = closed.length > 0 ? netPL / closed.length : 0;
    return {
      netPL,
      wins,
      losses,
      closed: closed.length,
      successRate,
      avgClosed,
    };
  }, [trades]);
  const cashflow = useMemo(() => {
    const netRevenue = trades.reduce((sum, t) => sum + tradeNetRevenue(t), 0);
    const avgRevenue = trades.length > 0 ? netRevenue / trades.length : 0;
    return { netRevenue, avgRevenue };
  }, [trades]);
  const matched = useMemo(() => buildMatchedClosePL(trades), [trades]);
  const agentWinRate =
    matched.agentWins+matched.agentLosses > 0
      ? (matched.agentWins / (matched.agentWins + matched.agentLosses)) * 100
      : 0;
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <button
        className="w-full flex items-center justify-between px-5 py-3 text-left"
        onClick={() => setOpen((v) => !v)}>
        <span className="text-sm font-semibold text-foreground flex items-center gap-2">
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <HistoryIcon size={15} /> Trade history{' '}
          <span className="font-normal text-muted-foreground">
            ({trades.length})
          </span>
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-border/40 pt-4">
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <PipelineStat
              label="Net realised P/L"
              value={fmtUSD(perf.netPL)}
            />
            <PipelineStat
              label="Closed trades"
              value={`${perf.closed} (${perf.successRate.toFixed(1)}% win)`}
            />
            <PipelineStat
              label="Wins / Losses"
              value={`${perf.wins} / ${perf.losses}`}
            />
            <PipelineStat
              label="Avg per close"
              value={fmtUSD(perf.avgClosed)}
            />
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-2">
            <PipelineStat
              label="Net revenue (cashflow)"
              value={fmtUSD(cashflow.netRevenue)}
            />
            <PipelineStat
              label="Avg revenue / tx"
              value={fmtUSD(cashflow.avgRevenue)}
            />
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <PipelineStat
              label="Matched close P/L"
              value={fmtUSD(matched.net)}
            />
            <PipelineStat
              label="Matched closes"
              value={`${matched.closedCount} (${matched.wins}/${matched.wins + matched.losses} wins)`}
            />
            <PipelineStat
              label="Agent success"
              value={`${agentWinRate.toFixed(1)}% (${matched.agentWins}/${matched.agentWins + matched.agentLosses})`}
            />
          </div>
          {reversed.length === 0 ? (
            <div className="text-xs text-muted-foreground">No trades yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 font-medium">Time</th>
                    <th className="text-left font-medium">Side</th>
                    <th className="text-left font-medium">Position</th>
                    <th className="text-left font-medium">Leg</th>
                    <th className="text-left font-medium">Symbol</th>
                    <th className="text-right font-medium">Qty</th>
                    <th className="text-right font-medium">Price</th>
                    <th className="text-right font-medium">Total</th>
                    <th className="text-right font-medium">Net revenue</th>
                    <th className="text-right font-medium">Matched P/L</th>
                    <th className="text-right font-medium">Realised</th>
                    <th className="text-left font-medium pl-3">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {reversed.slice(0, 200).map((t) => {
                    const posType = tradePositionType(t.side);
                    const legType = tradeLegType(t.side);
                    const netRev = tradeNetRevenue(t);
                    const matchedPL = matched.byTradeId[t.id];
                    return (
                    <tr key={t.id} className="border-b border-border/30">
                      <td className="py-1.5 tabular-nums text-xs text-muted-foreground">
                        {fmtTime(t.time)}
                      </td>
                      <td>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold ${
                            t.side === 'buy' || t.side === 'add' || t.side === 'cover'
                              ? 'bg-emerald-500/15 text-emerald-500'
                              : t.side === 'short'
                                ? 'bg-amber-500/15 text-amber-500'
                                : 'bg-red-500/15 text-red-500'
                          }`}>
                          {t.side}
                        </span>
                      </td>
                      <td className="text-xs">
                        <span
                          className={`px-1.5 py-0.5 rounded uppercase font-semibold ${
                            posType === 'short'
                              ? 'bg-amber-500/15 text-amber-500'
                              : 'bg-emerald-500/15 text-emerald-500'
                          }`}>
                          {posType}
                        </span>
                      </td>
                      <td className="text-xs">
                        <span className="px-1.5 py-0.5 rounded uppercase font-semibold bg-muted text-foreground/80">
                          {legType}
                        </span>
                      </td>
                      <td className="font-medium">{t.symbol}</td>
                      <td className="text-right tabular-nums">
                        {fmtQty(t.qty)}
                      </td>
                      <td className="text-right tabular-nums">
                        {fmtUSD(t.price)}
                      </td>
                      <td className="text-right tabular-nums">
                        {fmtUSD(t.total)}
                      </td>
                      <td
                        className={`text-right tabular-nums font-medium ${
                          netRev >= 0 ? 'text-emerald-500' : 'text-red-500'
                        }`}>
                        {fmtUSD(netRev)}
                      </td>
                      <td
                        className={`text-right tabular-nums font-medium ${
                          matchedPL == null
                            ? ''
                            : matchedPL >= 0
                              ? 'text-emerald-500'
                              : 'text-red-500'
                        }`}>
                        {matchedPL == null ? '—' : fmtUSD(matchedPL)}
                      </td>
                      <td
                        className={`text-right tabular-nums ${
                          t.realised == null
                            ? ''
                            : t.realised >= 0
                              ? 'text-emerald-500'
                              : 'text-red-500'
                        }`}>
                        {t.realised != null ? fmtUSD(t.realised) : '—'}
                      </td>
                      <td className="text-xs text-foreground/85 pl-3 max-w-md whitespace-normal wrap-break-word">
                        {t.source === 'manual' ? '(manual) ' : ''}
                        {t.reason}
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Advanced (collapsed) ───────────────────────────────────────────────────

function AdvancedCard(props: {
  state: TraderState;
  busy: boolean;
  onTrade: (symbol: string, side: 'buy' | 'sell', qty: number) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [qty, setQty] = useState('1');
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <button
        className="w-full flex items-center justify-between px-5 py-3 text-left"
        onClick={() => setOpen((v) => !v)}>
        <span className="text-sm font-semibold text-foreground flex items-center gap-2">
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <Settings size={15} /> Advanced — manual override & reset
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-border/40 pt-4 space-y-4">
          <div className="text-xs text-muted-foreground">
            You normally don't need this. The agent runs your portfolio
            autonomously — these controls are for testing & corrections.
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Symbol</label>
              <Input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL"
                className="w-32"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Side</label>
              <select
                className="block h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={side}
                onChange={(e) => setSide(e.target.value as 'buy' | 'sell')}>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Qty</label>
              <Input
                type="number"
                value={qty}
                min={0}
                step="0.01"
                onChange={(e) => setQty(e.target.value)}
                className="w-24"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={props.busy || !symbol}
              onClick={() => {
                const n = Number(qty);
                if (!isFinite(n) || n <= 0) return;
                props.onTrade(symbol, side, n);
              }}>
              Execute
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={props.busy}
              onClick={() => {
                if (
                  !confirm(
                    'Reset portfolio? This wipes cash, positions, trade history and the equity curve. The watchlist stays.',
                  )
                )
                  return;
                props.onReset();
              }}>
              <Trash2 size={13} className="mr-1.5" />
              Reset portfolio
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Project board (Aria, PM) ───────────────────────────────────────────────

const TASK_COLUMNS: { key: TraderTaskStatus; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
];

const ROLE_LABEL: Record<string, string> = {
  account: 'Owen',
  allocator: 'Mason',
  reporter: 'Lana',
  analyst: 'Raj',
  risk: 'Mira',
  trader: 'Kenji',
  manager: 'Sofia',
  pm: 'Aria',
  research: 'Research desk',
  tech: 'Diane',
  energy: 'Marcus',
  auto: 'Sora',
  banks: 'Imani',
  crypto: 'Kai',
  geopolitics: 'Hassan',
  healthcare: 'Priya',
  consumer: 'Wei',
};

const KIND_TONE: Record<TraderTaskKind, string> = {
  trade: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  research: 'bg-sky-500/10 text-sky-500 border-sky-500/30',
  monitor: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  ops: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
};

function TaskBoardCard({
  tasks,
  onChanged,
}: {
  tasks: TraderTask[];
  onChanged: () => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [selected, setSelected] = useState<TraderTask | null>(null);
  const grouped = useMemo(() => {
    const g: Record<TraderTaskStatus, TraderTask[]> = {
      backlog: [],
      in_progress: [],
      review: [],
      done: [],
      archived: [],
    };
    for (const t of tasks) {
      if (g[t.status]) g[t.status].push(t);
    }
    for (const k of Object.keys(g) as TraderTaskStatus[]) {
      g[k].sort((a, b) => {
        const rank = (p: string) =>
          p === 'high' ? 0 : p === 'normal' ? 1 : 2;
        if (rank(a.priority) !== rank(b.priority))
          return rank(a.priority) - rank(b.priority);
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
    }
    return g;
  }, [tasks]);
  const visibleColumns = useMemo(
    () => TASK_COLUMNS.filter((c) => c.key !== 'done' || showDone),
    [showDone],
  );

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Project board</h3>
          <span className="text-[11px] text-muted-foreground">
            · Aria (PM) maintains this between meetings
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Hide done' : `Show done (${grouped.done.length})`}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowNew(true)}>
            <Plus size={13} className="mr-1.5" /> New task
          </Button>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {visibleColumns.map((col) => (
          <div
            key={col.key}
            className="rounded-lg border border-border/60 bg-muted/10 p-2 min-h-[120px]">
            <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-border/40">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {col.label}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {grouped[col.key].length}
              </span>
            </div>
            <div className="space-y-1.5">
              {grouped[col.key].length === 0 && (
                <div className="text-[11px] text-muted-foreground/60 px-1 py-2 italic">
                  empty
                </div>
              )}
              {grouped[col.key].map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onClick={() => setSelected(t)}
                  onMove={async (to) => {
                    try {
                      await traderApi.moveTask(t.id, to, '');
                      onChanged();
                    } catch {
                      // swallow — UI will refetch on next poll
                    }
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {showNew && (
        <NewTaskModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            onChanged();
          }}
        />
      )}
      {selected && (
        <TaskDetailModal task={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}

function TaskCard({
  task,
  onClick,
  onMove,
}: {
  task: TraderTask;
  onClick: () => void;
  onMove: (to: TraderTaskStatus) => void;
}) {
  const tone = KIND_TONE[task.kind] ?? KIND_TONE.ops;
  const owner = ROLE_LABEL[task.assigned_to] ?? task.assigned_to;
  const isHigh = task.priority === 'high';
  // Compute the next status forward for the inline arrow button.
  const next: Record<TraderTaskStatus, TraderTaskStatus | null> = {
    backlog: 'in_progress',
    in_progress: 'review',
    review: 'done',
    done: null,
    archived: null,
  };
  const fwd = next[task.status];
  return (
    <div
      onClick={onClick}
      className={`group rounded-md border bg-card/60 px-2 py-1.5 cursor-pointer transition-colors hover:bg-card ${
        isHigh ? 'border-rose-500/40' : 'border-border/50'
      }`}>
      <div className="flex items-start gap-1.5">
        <span
          className={`shrink-0 rounded-sm border px-1 py-px text-[9px] font-semibold uppercase tracking-wider ${tone}`}>
          {task.kind}
        </span>
        <span className="text-[11px] font-medium text-foreground leading-snug flex-1 line-clamp-2">
          {task.title}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
        <span className="truncate">
          {owner}
          {task.symbol ? ` · ${task.symbol}` : ''}
          {isHigh ? ' · HIGH' : ''}
        </span>
        {fwd && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMove(fwd);
            }}
            className="opacity-0 group-hover:opacity-100 text-primary hover:underline transition-opacity"
            title={`Move to ${fwd.replace('_', ' ')}`}>
            →
          </button>
        )}
      </div>
    </div>
  );
}

function NewTaskModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<TraderTaskKind>('research');
  const [assigned, setAssigned] = useState('research');
  const [symbol, setSymbol] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl space-y-3"
        onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold">New task</h3>
        <Input
          autoFocus
          placeholder="Title (e.g. Research HOOD pre-market pop)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          placeholder="Optional context / description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs min-h-[70px]"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] space-y-1">
            <span className="text-muted-foreground">Kind</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as TraderTaskKind)}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs">
              <option value="research">research</option>
              <option value="trade">trade</option>
              <option value="monitor">monitor</option>
              <option value="ops">ops</option>
            </select>
          </label>
          <label className="text-[11px] space-y-1">
            <span className="text-muted-foreground">Priority</span>
            <select
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as 'low' | 'normal' | 'high')
              }
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs">
              <option value="low">low</option>
              <option value="normal">normal</option>
              <option value="high">high</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] space-y-1">
            <span className="text-muted-foreground">Assigned to</span>
            <select
              value={assigned}
              onChange={(e) => setAssigned(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs">
              {Object.entries(ROLE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v} ({k})
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] space-y-1">
            <span className="text-muted-foreground">Symbol (optional)</span>
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL"
            />
          </label>
        </div>
        {error && (
          <div className="text-[11px] text-rose-400">{error}</div>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy || !title.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await traderApi.createTask({
                  title: title.trim(),
                  description: description.trim() || undefined,
                  kind,
                  assigned_to: assigned,
                  symbol: symbol.trim() || undefined,
                  priority,
                });
                onCreated();
              } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Failed');
              } finally {
                setBusy(false);
              }
            }}>
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}

function TaskDetailModal({
  task,
  onClose,
}: {
  task: TraderTask;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-xl border border-border bg-card p-5 shadow-xl space-y-3"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5 flex-1 min-w-0">
            <h3 className="text-sm font-semibold leading-tight">{task.title}</h3>
            <div className="text-[11px] text-muted-foreground">
              {task.id} · {task.kind} ·{' '}
              {ROLE_LABEL[task.assigned_to] ?? task.assigned_to}
              {task.symbol ? ` · ${task.symbol}` : ''} ·{' '}
              <span
                className={
                  task.priority === 'high'
                    ? 'text-rose-400 font-medium'
                    : ''
                }>
                {task.priority}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label="Close">
            ✕
          </button>
        </div>
        {task.description && (
          <div className="text-xs text-foreground/85 whitespace-pre-wrap">
            {task.description}
          </div>
        )}
        {task.findings && (
          <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-sky-500 font-semibold mb-1.5">
              Research findings
            </div>
            <div className="text-xs text-foreground/90">
              <ChatMarkdown text={task.findings.summary} />
            </div>
            {task.findings.sources && task.findings.sources.length > 0 && (
              <div className="mt-2 pt-2 border-t border-sky-500/20 text-[11px] space-y-0.5">
                {task.findings.sources.map((url, i) => (
                  <div key={url} className="truncate">
                    <span className="text-muted-foreground mr-1">[{i + 1}]</span>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-400 hover:underline">
                      {url}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {task.notes && task.notes.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              History
            </div>
            <div className="space-y-1">
              {task.notes
                .slice()
                .reverse()
                .map((n, i) => (
                  <div
                    key={i}
                    className="text-[11px] border-l-2 border-border/60 pl-2 py-0.5">
                    <div className="text-muted-foreground">
                      {new Date(n.time).toLocaleString()} · {n.author}
                      {n.status ? ` · → ${n.status}` : ''}
                    </div>
                    {n.text && <div className="text-foreground/85">{n.text}</div>}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
