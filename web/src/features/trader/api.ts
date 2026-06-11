import { apiJson, apiJsonSafe } from '@/lib/api';

export type TraderQuote = {
  symbol: string;
  name?: string;
  price: number;
  currency?: string;
  prev_close?: number;
  change_pct: number;
  day_high?: number;
  day_low?: number;
  volume?: number;
  market_state?: string;
  fetched_at: string;
};

export type TraderPosition = {
  symbol: string;
  qty: number;
  avg_cost: number;
};

export type TraderTrade = {
  id: string;
  time: string;
  symbol: string;
  side: 'buy' | 'sell' | 'add' | 'short' | 'cover';
  qty: number;
  price: number;
  total: number;
  reason?: string;
  source: 'agent' | 'manual';
  realised?: number;
};

export type TraderNews = {
  symbol: string;
  title: string;
  link: string;
  source?: string;
  published: string;
  summary?: string;
};

export type TraderDecision = {
  symbol: string;
  action: 'buy' | 'sell' | 'hold';
  qty?: number;
  reason?: string;
  horizon_min?: number;
  target_price?: number;
  stop_price?: number;
  confidence?: number;
  risk?: number;
  executed: boolean;
  rejected?: string;
};

export type TraderPositionPlan = {
  symbol: string;
  thesis: string;
  horizon_min: number;
  target_price: number;
  stop_price: number;
  confidence: number;
  opened_at: string;
  updated_at: string;
};

export type TraderPricePoint = {
  time: string;
  price: number;
};

export type TraderForecastPoint = {
  time: string;
  price: number;
  lower: number;
  upper: number;
};

export type TraderForecast = {
  symbol: string;
  generated_at: string;
  base_price: number;
  horizon_h: number;
  slope_per_h: number;
  sigma_pct: number;
  direction: 'up' | 'down' | 'flat' | string;
  confidence: number;
  curve: TraderForecastPoint[];
  snap_5h: TraderForecastPoint;
  snap_10h: TraderForecastPoint;
  sample_size: number;
};

export type TraderLesson = {
  time: string;
  symbol: string;
  realised_pl: number;
  hold_min?: number;
  text: string;
};

export type TraderTaskNote = {
  time: string;
  author: string;
  text: string;
  status?: string;
};

export type TraderTaskFinding = {
  time: string;
  summary: string;
  sources?: string[];
};

export type TraderTaskStatus =
  | 'backlog'
  | 'in_progress'
  | 'review'
  | 'done'
  | 'archived';

export type TraderTaskKind = 'trade' | 'research' | 'monitor' | 'ops';

export type TraderTask = {
  id: string;
  title: string;
  description?: string;
  kind: TraderTaskKind;
  assigned_to: string;
  symbol?: string;
  status: TraderTaskStatus;
  priority: 'low' | 'normal' | 'high';
  created_at: string;
  updated_at: string;
  due_at?: string;
  notes?: TraderTaskNote[];
  findings?: TraderTaskFinding;
};

export type TraderTickStatus = {
  active: boolean;
  phase: string;
  step: number;
  total: number;
  started_at?: string;
  updated_at?: string;
  message?: string;
  /** Live transcript of the in-progress meeting; only populated while
   * `active` is true. Each completed panel turn is appended as it lands. */
  conversation?: Array<{
    role: string;
    content: string;
    model?: string;
    latency_ms?: number;
    time: string;
  }>;
};

export type TraderPendingOrder = {
  id: string;
  symbol: string;
  side: 'buy' | 'sell' | string;
  qty: number;
  filled_qty: number;
  status: string;
  type: string;
  submitted_at?: string;
};

export type TraderBrokerStatus = {
  name: string;
  connected: boolean;
  cash: number;
  equity: number;
  buying_power: number;
  error?: string;
  checked_at?: string;
  pending_orders?: TraderPendingOrder[];
};

export type TraderConversationTurn = {
  role: string;
  content: string;
  model?: string;
  latency_ms?: number;
  time: string;
};

export type TraderAgentLog = {
  id: string;
  time: string;
  model?: string;
  summary?: string;
  decisions: TraderDecision[];
  conversation?: TraderConversationTurn[];
  error?: string;
  latency_ms?: number;
};

export type TraderEquityPoint = {
  time: string;
  equity: number;
  cash: number;
  pl: number;
};

export type TraderStats = {
  total_trades: number;
  buy_count: number;
  sell_count: number;
  wins: number;
  losses: number;
  win_rate: number;
  realised_pl: number;
  unrealised_pl: number;
  best_symbol?: string;
  best_symbol_pl: number;
  worst_symbol?: string;
  worst_symbol_pl: number;
  positions_value: number;
};

export type TraderMarketSession = {
  name: string;          // "US" | "Europe" | "Asia"
  tz: string;            // IANA zone
  local_now: string;     // pretty local time
  phase: 'open' | 'pre' | 'post' | 'closed' | 'weekend';
  open: boolean;
  next_open?: string;    // ISO timestamp
  next_close?: string;   // ISO timestamp (only when open)
};

export type TraderState = {
  running: boolean;
  cash: number;
  deposited: number;
  withdrawn: number;
  watchlist: string[];
  positions: TraderPosition[];
  trades: TraderTrade[];
  logs: TraderAgentLog[];
  equity_history: TraderEquityPoint[];
  plans: TraderPositionPlan[];
  memo: string;
  tick_status: TraderTickStatus;
  broker?: TraderBrokerStatus;
  interval_min: number;
  last_tick?: string;
  next_tick?: string;
  created_at: string;
  updated_at: string;
  quotes: TraderQuote[];
  news: TraderNews[];
  price_history: Record<string, TraderPricePoint[]>;
  forecasts?: Record<string, TraderForecast>;
  lessons?: TraderLesson[];
  tasks?: TraderTask[];
  equity: number;
  pl: number;
  stats: TraderStats;
  sessions?: TraderMarketSession[];
};

export const traderApi = {
  state: () => apiJsonSafe<TraderState>('/api/trader/state'),
  start: () => apiJson<{ ok: boolean }>('/api/trader/start', { method: 'POST' }),
  stop: () => apiJson<{ ok: boolean }>('/api/trader/stop', { method: 'POST' }),
  tick: () => apiJson<{ ok: boolean }>('/api/trader/tick', { method: 'POST' }),
  deposit: (amount: number) =>
    apiJson<{ ok: boolean }>('/api/trader/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),
  withdraw: (amount: number) =>
    apiJson<{ ok: boolean }>('/api/trader/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),
  reset: () => apiJson<{ ok: boolean }>('/api/trader/reset', { method: 'POST' }),
  setWatchlist: (symbols: string[], intervalMin?: number) =>
    apiJson<{ ok: boolean }>('/api/trader/watchlist', {
      method: 'POST',
      body: JSON.stringify({ symbols, interval_min: intervalMin ?? 0 }),
    }),
  manualTrade: (symbol: string, side: 'buy' | 'sell', qty: number) =>
    apiJson<TraderTrade>('/api/trader/trade', {
      method: 'POST',
      body: JSON.stringify({ symbol, side, qty }),
    }),
  news: (symbols: string[], per = 3) =>
    apiJsonSafe<TraderNews[]>(
      `/api/trader/news?symbols=${encodeURIComponent(symbols.join(','))}&per=${per}`,
    ),
  bars: (symbol: string, timeframe = '1Hour') =>
    apiJsonSafe<TraderBarsResponse>(
      `/api/trader/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
    ),
  createTask: (input: {
    title: string;
    description?: string;
    kind?: TraderTaskKind;
    assigned_to?: string;
    symbol?: string;
    priority?: 'low' | 'normal' | 'high';
  }) =>
    apiJson<TraderTask>('/api/trader/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  moveTask: (id: string, to_status: TraderTaskStatus, note?: string) =>
    apiJson<TraderTask>('/api/trader/tasks/move', {
      method: 'POST',
      body: JSON.stringify({ id, to_status, note }),
    }),
  alpacaGet: () => apiJsonSafe<TraderAlpacaConfig>('/api/trader/alpaca'),
  alpacaSave: (cfg: { key_id: string; secret: string; base_url: string }) =>
    apiJson<{ ok: boolean }>('/api/trader/alpaca', {
      method: 'POST',
      body: JSON.stringify(cfg),
    }),
  alpacaTest: (cfg: { key_id: string; secret: string; base_url: string }) =>
    apiJson<TraderAlpacaTestResult>('/api/trader/alpaca/test', {
      method: 'POST',
      body: JSON.stringify(cfg),
    }),
  alpacaClear: () =>
    apiJson<{ ok: boolean }>('/api/trader/alpaca', { method: 'DELETE' }),
};

export type TraderHistoricalBar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type TraderBarsResponse = {
  symbol: string;
  timeframe: string;
  bars: TraderHistoricalBar[];
};

export type TraderAlpacaConfig = {
  enabled: boolean;
  name: string;
  key_id: string;
  secret: string; // masked
  base_url: string;
};

export type TraderAlpacaTestResult = {
  ok: boolean;
  account_id: string;
  status: string;
  currency: string;
  cash: string;
  equity: string;
  buying_power: string;
};
