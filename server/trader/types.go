// Package trader is a paper-trading agent that uses real market data from
// Yahoo Finance (free, unauthenticated) but virtual cash. An LLM running on
// our own infra is asked every N minutes to look at the latest prices and
// per-symbol news headlines and emit a JSON action plan (buy / sell / hold).
//
// State (cash, positions, trade log, watchlist, settings) is persisted to
// <data>/trader.json so the portfolio survives restarts. There is exactly
// one Manager per server process; concurrency is guarded by a single mutex
// inside the manager.
package trader

import (
	"time"
)

// Quote is the snapshot the UI / LLM see for one symbol.
type Quote struct {
	Symbol        string    `json:"symbol"`
	Name          string    `json:"name,omitempty"`
	Price         float64   `json:"price"`
	Currency      string    `json:"currency,omitempty"`
	PrevClose     float64   `json:"prev_close,omitempty"`
	ChangePct     float64   `json:"change_pct"`
	DayHigh       float64   `json:"day_high,omitempty"`
	DayLow        float64   `json:"day_low,omitempty"`
	Volume        int64     `json:"volume,omitempty"`
	MarketState   string    `json:"market_state,omitempty"`
	FetchedAt     time.Time `json:"fetched_at"`
}

// Position is what we currently hold of one symbol. AvgCost is the
// weighted average buy price across all open shares so realised P/L can
// be computed correctly on partial sells.
type Position struct {
	Symbol       string  `json:"symbol"`
	Qty          float64 `json:"qty"`
	AvailableQty float64 `json:"available_qty"` // qty not locked by bracket orders; 0 means unknown (treat as Qty)
	AvgCost      float64 `json:"avg_cost"`
}

// Trade is one immutable buy/sell event for the audit log.
type Trade struct {
	ID       string    `json:"id"`
	Time     time.Time `json:"time"`
	Symbol   string    `json:"symbol"`
	Side     string    `json:"side"` // "buy" | "sell"
	Qty      float64   `json:"qty"`
	Price    float64   `json:"price"`
	Total    float64   `json:"total"`
	Reason   string    `json:"reason,omitempty"`
	Source   string    `json:"source"` // "agent" | "manual"
	Realised float64   `json:"realised,omitempty"` // realised P/L on sells
}

// NewsItem is one headline fed to the LLM and shown in the UI.
type NewsItem struct {
	Symbol      string    `json:"symbol"`
	Title       string    `json:"title"`
	Link        string    `json:"link"`
	Source      string    `json:"source,omitempty"`
	Published   time.Time `json:"published"`
	Summary     string    `json:"summary,omitempty"`
	// Sentiment is a lexicon-scored polarity in [-1, +1] (+1 = strongly
	// bullish, -1 = strongly bearish, 0 = neutral). Computed locally
	// from the headline + summary; no LLM cost. See sentiment.go.
	Sentiment   float64   `json:"sentiment,omitempty"`
}

// AgentLog captures one LLM tick — what the model saw, what it decided,
// whether the decisions executed cleanly. Used for the "Why did it trade?"
// drawer in the UI.
type AgentLog struct {
	ID           string             `json:"id"`
	Time         time.Time          `json:"time"`
	Model        string             `json:"model,omitempty"`
	Summary      string             `json:"summary,omitempty"`
	Decisions    []Decision         `json:"decisions"`
	Conversation []ConversationTurn `json:"conversation,omitempty"`
	Error        string             `json:"error,omitempty"`
	LatencyMs    int64              `json:"latency_ms,omitempty"`
}

// ConversationTurn is one role's contribution to the panel discussion that
// happens every tick. Roles are: "reporter", "analyst", "risk", "trader",
// "executor". The executor's content is the raw JSON action plan; every
// other role speaks in prose.
type ConversationTurn struct {
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	Model     string    `json:"model,omitempty"`
	LatencyMs int64     `json:"latency_ms,omitempty"`
	Time      time.Time `json:"time"`
}

// Decision is what the LLM proposed for one symbol on a given tick. The
// executed flag records whether the manager actually placed it (rejected
// trades carry a reason). HorizonMin / TargetPrice / StopPrice / Confidence
// are forward-looking fields the LLM uses to plan, so the next tick has
// context on why a trade was opened and when it should be closed.
type Decision struct {
	Symbol      string  `json:"symbol"`
	Action      string  `json:"action"` // "buy" | "sell" | "hold"
	Qty         float64 `json:"qty,omitempty"`
	Reason      string  `json:"reason,omitempty"`
	HorizonMin  int     `json:"horizon_min,omitempty"`  // planned holding period
	TargetPrice float64 `json:"target_price,omitempty"` // take-profit
	StopPrice   float64 `json:"stop_price,omitempty"`   // cut-loss
	Confidence  float64 `json:"confidence,omitempty"`   // 0–1
	Risk        float64 `json:"risk,omitempty"`         // 0–1, how risky the LLM rates this trade
	Executed    bool    `json:"executed"`
	Rejected    string  `json:"rejected,omitempty"`
}

// PositionPlan is the agent's open thesis for one held symbol. Created /
// updated whenever the LLM opens or adds to a position; cleared when fully
// sold. Passed back into every future tick so the agent has continuity.
type PositionPlan struct {
	Symbol      string    `json:"symbol"`
	Thesis      string    `json:"thesis"`
	HorizonMin  int       `json:"horizon_min"`
	TargetPrice float64   `json:"target_price"`
	StopPrice   float64   `json:"stop_price"`
	Confidence  float64   `json:"confidence"`
	OpenedAt    time.Time `json:"opened_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// PricePoint is one sample of an individual symbol's price, used for the
// per-position sparklines on the dashboard. Sampled on every quote refresh.
type PricePoint struct {
	Time  time.Time `json:"time"`
	Price float64   `json:"price"`
}

// ForecastPoint is one extrapolated price + confidence band sample at a
// future timestamp. The dashboard renders these as a dotted line with
// a shaded band beyond the most recent real PricePoint.
type ForecastPoint struct {
	Time  time.Time `json:"time"`
	Price float64   `json:"price"`        // central estimate
	Lower float64   `json:"lower"`        // lower bound of confidence band
	Upper float64   `json:"upper"`        // upper bound of confidence band
}

// Forecast is the per-symbol short-horizon prediction generated at the
// end of every tick. It bundles a couple of named horizon snapshots
// (typically +5h and +10h) plus a denser projected curve we draw on
// the chart, all with a confidence band derived from recent volatility.
type Forecast struct {
	Symbol      string          `json:"symbol"`
	GeneratedAt time.Time       `json:"generated_at"`
	BasePrice   float64         `json:"base_price"`   // last real sample used as the anchor
	HorizonH    float64         `json:"horizon_h"`    // farthest horizon in hours (e.g. 10)
	SlopePerH   float64         `json:"slope_per_h"`  // implied price drift per hour
	SigmaPct    float64         `json:"sigma_pct"`    // 1σ relative volatility per √h
	Direction   string          `json:"direction"`    // "up" | "down" | "flat"
	Confidence  float64         `json:"confidence"`   // 0..1 — higher when slope >> noise
	Curve       []ForecastPoint `json:"curve"`        // smooth projection (e.g. 12 points across the horizon)
	Snap5h      ForecastPoint   `json:"snap_5h"`      // central prediction at +5h
	Snap10h     ForecastPoint   `json:"snap_10h"`     // central prediction at +10h
	SampleSize  int             `json:"sample_size"`  // history points used to fit
}

// Lesson is a single bullet-form learning written by the Coach after a
// position fully closes (or after a meaningful stop-out). Surfaced to
// the panel briefing so the team avoids repeating mistakes.
type Lesson struct {
	Time       time.Time `json:"time"`
	Symbol     string    `json:"symbol"`
	RealisedPL float64   `json:"realised_pl"`
	HoldMin    int       `json:"hold_min,omitempty"`
	Text       string    `json:"text"`
}

// RoleOverride is a short coaching note from HR (Hank) that is
// appended to a target role's system prompt at the start of the next
// meeting. Overrides accumulate up to a small cap; HR can also clear
// them by issuing a "clear" op for a role.
type RoleOverride struct {
	Time time.Time `json:"time"`
	Note string    `json:"note"`
	// TempDelta optionally shifts the role's sampling temperature.
	// Effective temperature is clamped to [0.05, 1.0]. Zero means no
	// change.
	TempDelta float64 `json:"temp_delta,omitempty"`
}

// EquityPoint is one sample of total portfolio value over time, used by
// the dashboard to render the equity curve. We sample on every quote
// refresh (capped to one per minute) and persist a rolling window.
type EquityPoint struct {
	Time   time.Time `json:"time"`
	Equity float64   `json:"equity"`
	Cash   float64   `json:"cash"`
	PL     float64   `json:"pl"`
}

// TickStatus reflects the current phase of an in-flight tick (or the last
// completed one when Active=false). Driven by the manager so the UI can
// render a live progress bar.
type TickStatus struct {
	Active    bool      `json:"active"`
	Phase     string    `json:"phase"`               // "" | "refreshing_quotes" | "fetching_news" | "asking_llm" | "executing" | "done" | "error"
	Step      int       `json:"step"`                // 1-based phase index, 0 = idle
	Total     int       `json:"total"`               // total phase count for progress bar
	StartedAt time.Time `json:"started_at,omitempty"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
	Message   string    `json:"message,omitempty"`   // optional detail (e.g. "50 quotes")
	// Conversation streams the in-progress meeting turn-by-turn so the
	// dashboard can render the discussion live as the panel speaks.
	// Cleared when a tick starts; populated as each role finishes; the
	// final completed transcript also lives in the most-recent AgentLog.
	Conversation []ConversationTurn `json:"conversation,omitempty"`
}

// BrokerStatus describes the upstream broker (if any). When Connected is
// false the trader is in fully-simulated mode (cash and positions live
// only in trader.json).
type BrokerStatus struct {
	Name        string  `json:"name"`         // "alpaca-paper" | ""
	Connected   bool    `json:"connected"`
	Cash        float64 `json:"cash"`         // mirrored from broker
	Equity      float64 `json:"equity"`
	BuyingPower float64 `json:"buying_power"`
	Error       string  `json:"error,omitempty"`
	CheckedAt   time.Time `json:"checked_at,omitempty"`
	PendingOrders []PendingOrder `json:"pending_orders,omitempty"`
}

// PendingOrder is a slimmed-down view of a broker order that hasn't
// reached a terminal state yet (still working / partially filled).
// Surfaced to the dashboard and read out by Owen each tick.
type PendingOrder struct {
	ID         string    `json:"id"`
	Symbol     string    `json:"symbol"`     // internal form (not Alpaca's BTC/USD)
	Side       string    `json:"side"`       // "buy" | "sell"
	Qty        float64   `json:"qty"`
	FilledQty  float64   `json:"filled_qty"`
	Status     string    `json:"status"`     // "new" | "accepted" | "partially_filled" | "pending_new" | ...
	Type       string    `json:"type"`       // "market" | "limit" | ...
	SubmittedAt time.Time `json:"submitted_at,omitempty"`
}

// BrokerConfig is the persisted credentials/config for the upstream
// broker. Stored in trader.json so the operator can manage them from the
// dashboard. The HTTP layer MUST blank Secret before serialising the
// State to API responses (handlers_trader.go does this).
type BrokerConfig struct {
	Enabled bool   `json:"enabled"`
	Name    string `json:"name"`     // "alpaca-paper" | "alpaca-live" | ""
	KeyID   string `json:"key_id"`
	Secret  string `json:"secret"`   // sensitive — masked in API responses
	BaseURL string `json:"base_url"` // e.g. https://paper-api.alpaca.markets
}

// State is the JSON blob shipped to the dashboard and persisted to disk.
type State struct {
	Running      bool       `json:"running"`
	Cash         float64    `json:"cash"`
	Deposited    float64    `json:"deposited"`
	Withdrawn    float64    `json:"withdrawn"`
	Watchlist    []string   `json:"watchlist"`
	Positions    []Position `json:"positions"`
	Trades       []Trade    `json:"trades"`
	Logs         []AgentLog `json:"logs"`
	Equity       []EquityPoint  `json:"equity_history"`
	Plans        []PositionPlan `json:"plans"`
	Memo         string         `json:"memo"`
	TickStatus   TickStatus     `json:"tick_status"`
	Broker       BrokerStatus   `json:"broker"`
	BrokerConfig BrokerConfig   `json:"broker_config"`
	// Forecasts is the most recent per-symbol short-horizon prediction
	// (5h / 10h) produced at the end of every tick. Used by the
	// dashboard to draw a forward projection on each position chart.
	Forecasts map[string]Forecast `json:"forecasts,omitempty"`
	// SeenNews maps a stable headline key (link or title hash) to the
	// time we first showed it to the panel. Used to dedupe headlines
	// across ticks so the team doesn't relitigate the same story every
	// meeting. GC'd to a 24h sliding window each tick.
	SeenNews map[string]time.Time `json:"seen_news,omitempty"`
	// Lessons are short post-mortem bullets written by the Coach role
	// after every closed round-trip. Newest first; capped at 50.
	Lessons      []Lesson   `json:"lessons,omitempty"`
	// Tasks is the project board the PM (Aria) maintains. Each tick
	// the PM creates, moves, and closes tasks based on the meeting.
	// Tasks are visible to assigned roles in their briefing.
	Tasks        []Task     `json:"tasks,omitempty"`
	// RoleOverrides is HR's living calibration sheet. Each entry maps
	// a role key (e.g. "trader") to a list of short coaching notes
	// appended to that role's system prompt next tick. Hank (HR)
	// rewrites this every meeting based on observed performance.
	RoleOverrides map[string][]RoleOverride `json:"role_overrides,omitempty"`
	IntervalMin  int        `json:"interval_min"`
	LastTick     time.Time  `json:"last_tick,omitempty"`
	NextTick     time.Time  `json:"next_tick,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}
