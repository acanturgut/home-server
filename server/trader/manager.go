package trader

import (
	"context"
	"fmt"
	"log"
	"math"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/acanturgut/home-server/ai"
)

// Manager owns the in-memory copy of State plus a single background
// goroutine that ticks every IntervalMin while Running is true.
// All mutations go through methods that take the mutex; callers receive
// deep copies so the UI cannot mutate manager state by accident.
type Manager struct {
	store  *Store
	router *ai.Router
	alpaca *AlpacaClient // optional; nil = fully simulated

	mu        sync.Mutex
	state     *State
	quotes    map[string]Quote        // last-seen quotes for the UI / equity calc
	priceHist map[string][]PricePoint // rolling per-symbol price samples
	news      []NewsItem        // last-seen news (rolling window)
	tickReq   chan struct{}     // wake the loop early (manual trigger)
	stopCh    chan struct{}     // close to terminate the loop
	loopOnce  sync.Once

	barCache map[string]barCacheEntry // key = symbol|timeframe
}

type barCacheEntry struct {
	bars      []HistoricalBar
	fetchedAt time.Time
}

// NewManager loads the persisted state. The trade loop does NOT start
// until Run(ctx) is called (typically from main.go).
func NewManager(store *Store, router *ai.Router) (*Manager, error) {
	return NewManagerWithBroker(store, router, nil)
}

// NewManagerWithBroker is like NewManager but also accepts an optional
// upstream broker (e.g. Alpaca paper). When non-nil, cash + positions
// are sourced from the broker and trades are routed to it.
//
// Persisted BrokerConfig in trader.json takes precedence over the
// env-derived client passed in here — the operator's UI choice always wins.
func NewManagerWithBroker(store *Store, router *ai.Router, alpaca *AlpacaClient) (*Manager, error) {
	st, err := store.Load()
	if err != nil {
		return nil, err
	}
	m := &Manager{
		store:     store,
		router:    router,
		alpaca:    alpaca,
		state:     st,
		quotes:    map[string]Quote{},
		priceHist: map[string][]PricePoint{},
		tickReq:   make(chan struct{}, 1),
		stopCh:    make(chan struct{}),
		barCache:  map[string]barCacheEntry{},
	}
	// If the persisted state has UI-saved Alpaca creds, they win over env.
	if cfg := st.BrokerConfig; cfg.Enabled && cfg.KeyID != "" && cfg.Secret != "" {
		if client := NewAlpaca(cfg.KeyID, cfg.Secret, cfg.BaseURL); client != nil {
			m.alpaca = client
		}
	}
	if m.alpaca != nil {
		name := "alpaca-paper"
		if st.BrokerConfig.Name != "" {
			name = st.BrokerConfig.Name
		}
		m.state.Broker = BrokerStatus{Name: name}
	} else {
		m.state.Broker = BrokerStatus{}
	}
	return m, nil
}

// Run blocks until ctx is cancelled, ticking the trading loop whenever
// the portfolio is Running. Refresh of quotes happens on every tick
// regardless of Running so the dashboard stays live.
func (m *Manager) Run(ctx context.Context) {
	m.loopOnce.Do(func() {
		// Background quote refresher (every 30s) — keeps the UI live.
		go m.quoteLoop(ctx)
		// Scalper micro-loop — checks open positions for target / stop /
		// momentum-trim opportunities between heavy meetings. Pure
		// rules-based, no LLM cost, runs every 60s.
		go m.scalperLoop(ctx)
	})
	for {
		// Schedule next tick. Note: `running` here is just used to set
		// NextTick / sleep duration; whether we actually tick on wake is
		// decided FRESHLY inside each select case (m.state.Running may
		// have flipped while we were sleeping).
		m.mu.Lock()
		interval := time.Duration(m.state.IntervalMin) * time.Minute
		if interval <= 0 {
			interval = 1 * time.Minute
		}
		if m.state.Running {
			m.state.NextTick = time.Now().Add(interval)
		} else {
			m.state.NextTick = time.Time{}
		}
		// Persist so the API surfaces an up-to-date next_tick to the UI
		// (otherwise we only save when a tick FINISHES, which means the
		// frontend sees a stale next_tick pointing at the previous tick).
		_ = m.store.Save(m.state)
		m.mu.Unlock()

		select {
		case <-ctx.Done():
			return
		case <-m.stopCh:
			return
		case <-m.tickReq:
			if m.isRunning() {
				log.Printf("trader: tick (manual)")
				m.tick(ctx)
			}
		case <-time.After(interval):
			if m.isRunning() {
				log.Printf("trader: tick (scheduled, every %s)", interval)
				m.tick(ctx)
			}
		}
	}
}

func (m *Manager) isRunning() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.state.Running
}

func (m *Manager) quoteLoop(ctx context.Context) {
	// 10s cadence so the dashboard feels live. Snapshot calls + a broker
	// account sync are both cheap (one HTTP round-trip each).
	t := time.NewTicker(10 * time.Second)
	defer t.Stop()
	// Initial fetch right away.
	_ = m.RefreshQuotes(ctx)
	_ = m.SyncBroker(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			_ = m.RefreshQuotes(ctx)
			_ = m.SyncBroker(ctx)
		}
	}
}

// SyncBroker pulls fresh cash + positions from the upstream broker (if
// configured) and overwrites our local state to match. No-op when the
// trader runs in pure-simulation mode. Failures are recorded on
// state.Broker.Error so the dashboard can surface them.
func (m *Manager) SyncBroker(ctx context.Context) error {
	if m.alpaca == nil {
		return nil
	}
	acct, err := m.alpaca.Account(ctx)
	if err != nil {
		m.mu.Lock()
		m.state.Broker.Connected = false
		m.state.Broker.Error = err.Error()
		m.state.Broker.CheckedAt = time.Now()
		m.mu.Unlock()
		return err
	}
	posRaw, err := m.alpaca.Positions(ctx)
	if err != nil {
		m.mu.Lock()
		m.state.Broker.Connected = false
		m.state.Broker.Error = err.Error()
		m.state.Broker.CheckedAt = time.Now()
		m.mu.Unlock()
		return err
	}
	cash, _ := strconv.ParseFloat(acct.Cash, 64)
	equity, _ := strconv.ParseFloat(acct.Equity, 64)
	bp, _ := strconv.ParseFloat(acct.BuyingPower, 64)

	// Open orders are best-effort — a failure here shouldn't poison
	// the rest of the sync (cash/positions are far more important).
	var pending []PendingOrder
	if openOrders, oerr := m.alpaca.OpenOrders(ctx); oerr == nil {
		// Position sign map lets us classify whether an open order is an
		// entry leg or just a protective exit leg from a bracket order.
		posBySym := make(map[string]float64, len(posRaw))
		for _, p := range posRaw {
			q, _ := strconv.ParseFloat(p.Qty, 64)
			posBySym[FromAlpacaSymbol(p.Symbol)] = q
		}
		for _, o := range openOrders {
			qty, _ := strconv.ParseFloat(o.Qty, 64)
			fqty, _ := strconv.ParseFloat(o.FilledQty, 64)
			sym := FromAlpacaSymbol(o.Symbol)
			side := strings.ToLower(o.Side)
			typ := strings.ToLower(o.Type)
			status := strings.ToLower(o.Status)
			posQty := posBySym[sym]

			// Bracket take-profit/stop exit legs can accumulate and are
			// expected; don't treat them as actionable "pending orders".
			isProtectiveExit := false
			if (typ == "limit" || typ == "stop" || typ == "stop_limit") && posQty > 0 && side == "sell" {
				isProtectiveExit = true
			}
			if (typ == "limit" || typ == "stop" || typ == "stop_limit") && posQty < 0 && side == "buy" {
				isProtectiveExit = true
			}
			if isProtectiveExit {
				continue
			}

			// Auto-prune stale entry limits so the order book doesn't bloat.
			if (status == "new" || status == "accepted" || status == "pending_new") &&
				typ == "limit" && !o.SubmittedAt.IsZero() && time.Since(o.SubmittedAt) > 30*time.Minute {
				_ = m.alpaca.CancelOrder(ctx, o.ID)
				continue
			}
			pending = append(pending, PendingOrder{
				ID:          o.ID,
				Symbol:      sym,
				Side:        side,
				Qty:         qty,
				FilledQty:   fqty,
				Status:      status,
				Type:        typ,
				SubmittedAt: o.SubmittedAt,
			})
		}
	}

	positions := make([]Position, 0, len(posRaw))
	for _, p := range posRaw {
		qty, _ := strconv.ParseFloat(p.Qty, 64)
		avg, _ := strconv.ParseFloat(p.AvgEntryPrice, 64)
		if qty == 0 {
			continue
		}
		availQty := qty
		if p.QtyAvailable != "" {
			if av, err := strconv.ParseFloat(p.QtyAvailable, 64); err == nil && av >= 0 {
				availQty = av
			}
		}
		positions = append(positions, Position{
			Symbol:       FromAlpacaSymbol(p.Symbol),
			Qty:          qty,
			AvailableQty: availQty,
			AvgCost:      avg,
		})
	}

	m.mu.Lock()
	m.state.Broker = BrokerStatus{
		Name:        "alpaca-paper",
		Connected:   true,
		Cash:        cash,
		Equity:      equity,
		BuyingPower: bp,
		CheckedAt:   time.Now(),
		PendingOrders: pending,
	}
	m.state.Cash = cash
	// Treat broker equity as our "deposited" baseline so P/L is computed
	// against the starting paper account value the very first time we
	// connect (Alpaca paper accounts default to $100k).
	if m.state.Deposited == 0 {
		m.state.Deposited = equity
	}
	m.state.Positions = positions
	// Mirror current_price into the quote cache so equity / sparklines work
	// even if Yahoo doesn't have the symbol.
	for _, p := range posRaw {
		cp, _ := strconv.ParseFloat(p.CurrentPrice, 64)
		if cp <= 0 {
			continue
		}
		sym := FromAlpacaSymbol(p.Symbol)
		q := m.quotes[sym]
		q.Symbol = sym
		q.Price = cp
		if q.FetchedAt.IsZero() {
			q.FetchedAt = time.Now()
		}
		m.quotes[sym] = q
	}
	_ = m.store.Save(m.state)
	m.mu.Unlock()
	return nil
}

// State returns a deep copy of the current state plus live quotes / news.
func (m *Manager) State() (*State, []Quote, []NewsItem, map[string][]PricePoint, float64, float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	st := *m.state
	// Always return non-nil slices so JSON serialises as [] not null.
	st.Positions = append([]Position{}, m.state.Positions...)
	st.Trades = append([]Trade{}, m.state.Trades...)
	st.Logs = append([]AgentLog{}, m.state.Logs...)
	st.Watchlist = append([]string{}, m.state.Watchlist...)
	st.Equity = append([]EquityPoint{}, m.state.Equity...)
	st.Plans = append([]PositionPlan{}, m.state.Plans...)
	quotes := make([]Quote, 0, len(m.quotes))
	for _, q := range m.quotes {
		quotes = append(quotes, q)
	}
	news := append([]NewsItem{}, m.news...)
	// Deep-copy price history so callers can't mutate manager state.
	ph := make(map[string][]PricePoint, len(m.priceHist))
	for sym, pts := range m.priceHist {
		ph[sym] = append([]PricePoint{}, pts...)
	}
	// Compute equity and P/L.
	equity := st.Cash
	for _, p := range st.Positions {
		if q, ok := m.quotes[p.Symbol]; ok && q.Price > 0 {
			equity += p.Qty * q.Price
		} else {
			equity += p.Qty * p.AvgCost // fall back to cost basis
		}
	}
	pl := equity - st.Deposited + st.Withdrawn
	return &st, quotes, news, ph, equity, pl
}

// Start flips Running=true and kicks an immediate tick.
func (m *Manager) Start() error {
	m.mu.Lock()
	if m.state.Running {
		m.mu.Unlock()
		return nil
	}
	m.state.Running = true
	if err := m.store.Save(m.state); err != nil {
		m.state.Running = false
		m.mu.Unlock()
		return err
	}
	m.mu.Unlock()
	select {
	case m.tickReq <- struct{}{}:
	default:
	}
	return nil
}

// Stop flips Running=false; the loop notices on its next iteration.
func (m *Manager) Stop() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.state.Running {
		return nil
	}
	m.state.Running = false
	m.state.NextTick = time.Time{}
	return m.store.Save(m.state)
}

// Deposit adds virtual cash. When connected to Alpaca, the broker is the
// source of truth and this is rejected — use the Alpaca dashboard.
func (m *Manager) Deposit(amount float64) error {
	if amount <= 0 {
		return fmt.Errorf("amount must be positive")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.alpaca != nil {
		return fmt.Errorf("cash is managed by Alpaca; use the Alpaca paper dashboard to adjust funds")
	}
	m.state.Cash += amount
	m.state.Deposited += amount
	return m.store.Save(m.state)
}

// Withdraw removes virtual cash. Capped at current cash. Rejected when
// running against Alpaca (broker is source of truth).
func (m *Manager) Withdraw(amount float64) error {
	if amount <= 0 {
		return fmt.Errorf("amount must be positive")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.alpaca != nil {
		return fmt.Errorf("cash is managed by Alpaca; use the Alpaca paper dashboard to adjust funds")
	}
	if amount > m.state.Cash {
		amount = m.state.Cash
	}
	m.state.Cash -= amount
	m.state.Withdrawn += amount
	return m.store.Save(m.state)
}

// Reset wipes positions, trades, and cash back to zero. Watchlist preserved.
// When connected to Alpaca, also liquidates the broker side (cancels
// open orders and closes every position at market).
func (m *Manager) Reset() error {
	if m.alpaca != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		if err := m.alpaca.CancelAllOrders(ctx); err != nil {
			log.Printf("trader: alpaca cancel-orders on reset: %v", err)
		}
		if err := m.alpaca.CloseAllPositions(ctx); err != nil {
			log.Printf("trader: alpaca close-positions on reset: %v", err)
		}
	}
	m.mu.Lock()
	wl := m.state.Watchlist
	interval := m.state.IntervalMin
	broker := m.state.Broker
	m.state = defaultState()
	m.state.Watchlist = wl
	m.state.IntervalMin = interval
	// Keep broker label so the UI badge stays accurate; SyncBroker will
	// rehydrate cash/positions on the next tick.
	m.state.Broker = BrokerStatus{Name: broker.Name}
	err := m.store.Save(m.state)
	m.mu.Unlock()
	if m.alpaca != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = m.SyncBroker(ctx)
	}
	return err
}

// SetWatchlist replaces the watchlist (case-insensitive de-dupe).
func (m *Manager) SetWatchlist(symbols []string) error {
	cleaned := cleanSymbols(symbols)
	m.mu.Lock()
	defer m.mu.Unlock()
	m.state.Watchlist = cleaned
	return m.store.Save(m.state)
}

// SetInterval changes the agent tick cadence (minutes).
func (m *Manager) SetInterval(min int) error {
	if min < 1 {
		return fmt.Errorf("interval must be at least 1 minute")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.state.IntervalMin = min
	return m.store.Save(m.state)
}

// TestAlpaca verifies the supplied credentials by calling /v2/account. Does
// not persist anything. Returns the live account snapshot on success.
func (m *Manager) TestAlpaca(ctx context.Context, keyID, secret, baseURL string) (*AlpacaAccount, error) {
	c := NewAlpaca(keyID, secret, baseURL)
	if c == nil {
		return nil, fmt.Errorf("key_id and secret are required")
	}
	return c.Account(ctx)
}

// SetAlpacaConfig validates the supplied credentials, persists them to
// trader.json, and swaps the live broker client. From this moment on,
// ticks route trades to Alpaca and SyncBroker mirrors cash + positions.
func (m *Manager) SetAlpacaConfig(ctx context.Context, keyID, secret, baseURL string) error {
	c := NewAlpaca(keyID, secret, baseURL)
	if c == nil {
		return fmt.Errorf("key_id and secret are required")
	}
	if _, err := c.Account(ctx); err != nil {
		return fmt.Errorf("alpaca rejected credentials: %w", err)
	}
	name := "alpaca-paper"
	if strings.Contains(strings.ToLower(c.baseURL), "paper") {
		name = "alpaca-paper"
	} else if c.baseURL != "" {
		name = "alpaca-live"
	}
	m.mu.Lock()
	m.alpaca = c
	m.state.BrokerConfig = BrokerConfig{
		Enabled: true,
		Name:    name,
		KeyID:   keyID,
		Secret:  secret,
		BaseURL: c.baseURL,
	}
	m.state.Broker = BrokerStatus{Name: name}
	err := m.store.Save(m.state)
	m.mu.Unlock()
	if err != nil {
		return err
	}
	// Pull fresh cash + positions immediately so the UI reflects the
	// connected account on the next poll.
	syncCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = m.SyncBroker(syncCtx)
	return nil
}

// ClearAlpacaConfig disconnects the broker. The local trader.json keeps
// whatever cash/positions it currently shows, but new trades go back to
// the simulated path.
func (m *Manager) ClearAlpacaConfig() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.alpaca = nil
	m.state.BrokerConfig = BrokerConfig{}
	m.state.Broker = BrokerStatus{}
	return m.store.Save(m.state)
}

// AlpacaConfig returns a copy of the persisted broker config (with the
// secret masked) for the API layer to surface in settings UI.
func (m *Manager) AlpacaConfig() BrokerConfig {
	m.mu.Lock()
	defer m.mu.Unlock()
	cfg := m.state.BrokerConfig
	if cfg.Secret != "" {
		cfg.Secret = maskSecret(cfg.Secret)
	}
	return cfg
}

func maskSecret(s string) string {
	if len(s) <= 4 {
		return "••••"
	}
	return strings.Repeat("•", len(s)-4) + s[len(s)-4:]
}

// ManualTrade lets the operator execute a trade at the current market price.
func (m *Manager) ManualTrade(symbol, side string, qty float64) (Trade, error) {
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	side = strings.ToLower(strings.TrimSpace(side))
	if qty <= 0 {
		return Trade{}, fmt.Errorf("qty must be positive")
	}
	if side != "buy" && side != "sell" {
		return Trade{}, fmt.Errorf("side must be buy or sell")
	}
	m.mu.Lock()
	q, ok := m.quotes[symbol]
	m.mu.Unlock()
	if !ok || q.Price <= 0 {
		// Try a live fetch as a fallback.
		quotes, _ := FetchQuotes(context.Background(), []string{symbol})
		if len(quotes) == 0 || quotes[0].Price <= 0 {
			return Trade{}, fmt.Errorf("no quote for %s", symbol)
		}
		q = quotes[0]
		m.mu.Lock()
		m.quotes[symbol] = q
		m.mu.Unlock()
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	tr, err := m.executeLocked(symbol, side, qty, q.Price, "Manual trade", "manual")
	if err != nil {
		return Trade{}, err
	}
	if side == "sell" && m.findPositionLocked(symbol) == nil {
		m.removePlanLocked(symbol)
	}
	_ = m.store.Save(m.state)
	return tr, nil
}

// RefreshQuotes fetches the latest quotes for the entire watchlist plus
// any held position symbols, and caches them on the manager. When a
// broker is connected we prefer its market-data API (so the dashboard
// shows the same prices the agent will fill at). Yahoo Finance is the
// fallback for anything Alpaca didn't return.
func (m *Manager) RefreshQuotes(ctx context.Context) error {
	m.mu.Lock()
	syms := append([]string(nil), m.state.Watchlist...)
	for _, p := range m.state.Positions {
		syms = append(syms, p.Symbol)
	}
	alpaca := m.alpaca
	m.mu.Unlock()
	syms = cleanSymbols(syms)
	if len(syms) == 0 {
		return nil
	}

	quotes := make([]Quote, 0, len(syms))
	got := map[string]bool{}

	// 1. Try Alpaca first if connected.
	if alpaca != nil {
		snaps, _ := alpaca.Snapshots(ctx, syms)
		for _, s := range snaps {
			if s.Price <= 0 {
				continue
			}
			changePct := 0.0
			if s.PrevClose > 0 {
				changePct = (s.Price - s.PrevClose) / s.PrevClose * 100
			}
			state := "OPEN"
			// Cheap heuristic: if dailyBar is empty and there's no recent
			// trade, market is probably closed. We don't fight Alpaca on
			// this — just label OPEN by default.
			ts := s.Timestamp
			if ts.IsZero() {
				ts = time.Now()
			}
			quotes = append(quotes, Quote{
				Symbol:      strings.ToUpper(s.Symbol),
				Price:       s.Price,
				PrevClose:   s.PrevClose,
				ChangePct:   changePct,
				DayHigh:     s.DayHigh,
				DayLow:      s.DayLow,
				Volume:      s.Volume,
				MarketState: state,
				FetchedAt:   ts,
			})
			got[strings.ToUpper(s.Symbol)] = true
		}
	}

	// 2. Fall back to Yahoo for anything still missing (mostly non-US
	// tickers or symbols outside Alpaca's universe).
	missing := make([]string, 0)
	for _, s := range syms {
		if !got[strings.ToUpper(s)] {
			missing = append(missing, s)
		}
	}
	if len(missing) > 0 {
		yq, err := FetchQuotes(ctx, missing)
		if err == nil {
			quotes = append(quotes, yq...)
		}
	}

	m.mu.Lock()
	now := time.Now()
	for _, q := range quotes {
		m.quotes[q.Symbol] = q
		if q.Price > 0 {
			pts := m.priceHist[q.Symbol]
			// Throttle to one sample per ~9s per symbol (just under the
			// 10s refresh cadence, so every refresh adds a point).
			if n := len(pts); n == 0 || now.Sub(pts[n-1].Time) >= 9*time.Second {
				pts = append(pts, PricePoint{Time: now, Price: q.Price})
				// Cap ~2880 samples per symbol (~8h at 10s cadence) so
				// the per-position chart can show a meaningful intraday
				// arc and the forecast model has enough history to fit.
				if len(pts) > 2880 {
					pts = pts[len(pts)-2880:]
				}
				m.priceHist[q.Symbol] = pts
			}
		}
	}
	m.sampleEquityLocked()
	m.mu.Unlock()
	return nil
}

// sampleEquityLocked records a point on the equity curve. Called from
// RefreshQuotes so the chart updates roughly every 30s. We throttle to
// one sample per 20s and keep a rolling window of ~2 weeks.
// Caller must hold m.mu.
func (m *Manager) sampleEquityLocked() {
	now := time.Now()
	if n := len(m.state.Equity); n > 0 {
		if now.Sub(m.state.Equity[n-1].Time) < 20*time.Second {
			return
		}
	}
	equity := m.state.Cash
	for _, p := range m.state.Positions {
		if q, ok := m.quotes[p.Symbol]; ok && q.Price > 0 {
			equity += p.Qty * q.Price
		} else {
			equity += p.Qty * p.AvgCost
		}
	}
	pl := equity - m.state.Deposited + m.state.Withdrawn
	m.state.Equity = append(m.state.Equity, EquityPoint{
		Time:   now,
		Equity: equity,
		Cash:   m.state.Cash,
		PL:     pl,
	})
	// Cap at ~2 weeks of 1-min samples (20160) but realistically we'll
	// rotate well before that; keep a soft cap of 5000 to bound JSON size.
	if len(m.state.Equity) > 5000 {
		m.state.Equity = m.state.Equity[len(m.state.Equity)-5000:]
	}
}

// RefreshNews returns headlines (and caches them).
func (m *Manager) RefreshNews(ctx context.Context, symbols []string, perSymbol int) ([]NewsItem, error) {
	if len(symbols) == 0 {
		m.mu.Lock()
		symbols = append([]string(nil), m.state.Watchlist...)
		m.mu.Unlock()
	}
	items, err := FetchNews(ctx, symbols, perSymbol)
	if err != nil {
		return nil, err
	}
	m.mu.Lock()
	m.news = items
	m.mu.Unlock()
	return items, nil
}

// filterAndMarkSeenNews drops any item whose key already lives in
// state.SeenNews and stamps the survivors as seen so subsequent ticks
// won't relitigate them. Entries older than `ttl` are GC'd.
func (m *Manager) filterAndMarkSeenNews(items []NewsItem, ttl time.Duration) []NewsItem {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state.SeenNews == nil {
		m.state.SeenNews = map[string]time.Time{}
	}
	now := time.Now()
	// GC old entries first.
	for k, t := range m.state.SeenNews {
		if now.Sub(t) > ttl {
			delete(m.state.SeenNews, k)
		}
	}
	out := make([]NewsItem, 0, len(items))
	for _, it := range items {
		key := newsKey(it)
		if key == "" {
			continue
		}
		if _, ok := m.state.SeenNews[key]; ok {
			continue // already discussed in a recent meeting
		}
		m.state.SeenNews[key] = now
		out = append(out, it)
	}
	return out
}

// newsKey produces a stable identifier for a headline. Prefers the
// link (most reliable across feeds) and falls back to a normalised
// title — lowercased, whitespace collapsed, leading source prefix
// stripped — so wire-service repostings don't all look unique.
func newsKey(it NewsItem) string {
	if l := strings.TrimSpace(it.Link); l != "" {
		return strings.ToLower(l)
	}
	t := strings.ToLower(strings.TrimSpace(it.Title))
	if t == "" {
		return ""
	}
	t = strings.Join(strings.Fields(t), " ")
	return it.Symbol + "|" + t
}

// TriggerTick asks the loop to run a tick right now (no-op if already pending
// or if not running).
func (m *Manager) TriggerTick() {
	select {
	case m.tickReq <- struct{}{}:
	default:
	}
}

// tick runs a single LLM-driven trading cycle: refresh data → call LLM →
// execute approved actions → persist.
func (m *Manager) tick(ctx context.Context) {
	start := time.Now()
	log.Printf("trader: tick start")
	m.setPhase("refreshing_quotes", 1, 4, "")
	if err := m.RefreshQuotes(ctx); err != nil {
		log.Printf("trader: quote refresh failed: %v", err)
	}
	m.mu.Lock()
	watch := append([]string(nil), m.state.Watchlist...)
	m.mu.Unlock()
	m.setPhase("fetching_news", 2, 4, fmt.Sprintf("%d symbols", len(watch)))
	news, _ := m.RefreshNews(ctx, watch, 5)
	macroNews, _ := FetchMacroNews(ctx, 3)
	news = append(news, macroNews...)
	// Dedupe: drop any headline we've shown the panel in the last 24h.
	news = m.filterAndMarkSeenNews(news, 24*time.Hour)
	log.Printf("trader: tick fetched %d quotes, %d headlines (after dedupe)", len(watch), len(news))

	m.mu.Lock()
	in := DecisionInput{
		Cash:      m.state.Cash,
		Positions: append([]Position(nil), m.state.Positions...),
		Watchlist: append([]string(nil), m.state.Watchlist...),
		Plans:     append([]PositionPlan(nil), m.state.Plans...),
		Memo:      m.state.Memo,
		Deposited: m.state.Deposited,
		Withdrawn: m.state.Withdrawn,
	}
	if m.state.Broker.Name != "" {
		brokerCopy := m.state.Broker
		in.Broker = &brokerCopy
	}
	for _, sym := range in.Watchlist {
		if q, ok := m.quotes[sym]; ok {
			in.Quotes = append(in.Quotes, q)
		}
	}
	// Provide a short recent-trades window so the LLM remembers what it
	// just did even if its memo gets sparse.
	if n := len(m.state.Trades); n > 0 {
		start := n - 20
		if start < 0 {
			start = 0
		}
		in.RecentTrades = append([]Trade(nil), m.state.Trades[start:]...)
	}
	m.mu.Unlock()
	in.News = news
	AnnotateSentiment(in.News)
	in.Round = 1
	in.MentionedTickers = extractMentionedTickers(news, in.Watchlist)
	in.Indicators = m.computeAllIndicators(ctx, in.Watchlist, in.Positions)
	// Build the list of symbols we want Kelly hints for: watchlist
	// plus any held positions not already on the watchlist.
	kellySymbols := append([]string(nil), in.Watchlist...)
	seenKelly := map[string]bool{}
	for _, s := range kellySymbols {
		seenKelly[s] = true
	}
	for _, p := range in.Positions {
		if !seenKelly[p.Symbol] {
			kellySymbols = append(kellySymbols, p.Symbol)
		}
	}
	in.KellyHints = m.computeKellyHints(kellySymbols)
	in.Lessons = m.recentLessons(10)
	// Snapshot the current task board so the panel (especially Aria,
	// the PM) sees what's already open before proposing changes.
	m.mu.Lock()
	if len(m.state.Tasks) > 0 {
		in.Tasks = append([]Task(nil), m.state.Tasks...)
	}
	m.mu.Unlock()

	m.setPhase("asking_llm", 3, 4, fmt.Sprintf("%d headlines", len(news)))
	// Stream each panel turn into TickStatus.Conversation so the
	// dashboard can render the meeting live as the team talks.
	in.OnTurn = func(turns []ConversationTurn) {
		m.mu.Lock()
		m.state.TickStatus.Conversation = turns
		m.state.TickStatus.UpdatedAt = time.Now()
		// Best-effort persist; we don't fail the tick on a save error.
		_ = m.store.Save(m.state)
		m.mu.Unlock()
	}
	model, memo, summary, decisions, watchAdd, watchRemove, conversation, err := Decide(ctx, m.router, in)
	logEntry := AgentLog{
		ID:           genID("log"),
		Time:         time.Now(),
		Model:        model,
		Summary:      summary,
		Conversation: conversation,
		LatencyMs:    time.Since(start).Milliseconds(),
	}
	if err != nil {
		logEntry.Error = err.Error()
		log.Printf("trader: LLM decide failed: %v", err)
		m.setPhase("error", 4, 4, err.Error())
		m.appendLog(logEntry)
		return
	}

	m.setPhase("executing", 4, 4, fmt.Sprintf("%d decisions", len(decisions)))
	// Execute each decision under the lock so cash never goes negative
	// from a race with a manual trade.
	m.mu.Lock()
	now := time.Now()
	for i, d := range decisions {
		if d.Action == "hold" || d.Qty <= 0 {
			decisions[i].Executed = false
			if d.Action != "hold" {
				decisions[i].Rejected = "qty is zero"
			}
			// Still refresh the plan if the LLM amended target/stop/horizon
			// on a held position.
			if d.Action == "hold" && (d.TargetPrice > 0 || d.StopPrice > 0 || d.HorizonMin > 0) {
				m.upsertPlanLocked(d, now, false)
			}
			continue
		}
		q, ok := m.quotes[d.Symbol]
		if !ok || q.Price <= 0 {
			decisions[i].Rejected = "no quote"
			continue
		}
		_, err := m.executeLockedFull(d.Symbol, d.Action, d.Qty, q.Price, d.TargetPrice, d.StopPrice, d.Reason, "agent")
		if err != nil {
			decisions[i].Rejected = err.Error()
			continue
		}
		decisions[i].Executed = true
		switch d.Action {
		case "buy", "add", "short":
			m.upsertPlanLocked(d, now, true)
		case "sell", "cover":
			// If the position was fully closed, drop the plan.
			if m.findPositionLocked(d.Symbol) == nil {
				m.removePlanLocked(d.Symbol)
			}
		}
	}
	if strings.TrimSpace(memo) != "" {
		m.state.Memo = strings.TrimSpace(memo)
	}
	// Apply panel-driven watchlist mutations. We refuse to remove any
	// symbol we currently hold (the agent must close the position first)
	// and we cap the watchlist at 30 symbols so it doesn't snowball.
	applyWatchlistChangesLocked(m, watchAdd, watchRemove)
	// Apply PM (Aria) board updates: extract the PM turn from the
	// transcript and parse its fenced JSON ops block. Best-effort —
	// a malformed reply just leaves the board unchanged.
	pmCreated, pmMoved, pmClosed := m.applyPMFromConversationLocked(conversation)
	if pmCreated+pmMoved+pmClosed > 0 {
		log.Printf("trader: PM board ops: +%d / →%d / ✓%d", pmCreated, pmMoved, pmClosed)
	}
	logEntry.Decisions = decisions
	m.state.LastTick = time.Now()
	m.mu.Unlock()

	executed := 0
	for _, d := range decisions {
		if d.Executed {
			executed++
		}
	}
	// If any agent decisions were rejected by the BROKER (not by local
	// guards like "qty is zero" or "no quote"), re-convene the team
	// with that context so they can revise. Capped at one extra round
	// to avoid spinning if the team can't fix it.
	rejected := collectBrokerRejections(decisions)
	if len(rejected) > 0 {
		m.setPhase("rebriefing", 4, 4, fmt.Sprintf("%d rejections — reconvening", len(rejected)))
		log.Printf("trader: %d broker rejection(s), running round 2", len(rejected))
		round2 := in
		round2.Round = 2
		round2.PriorRejections = rejected
		round2.Memo = strings.TrimSpace(memo) // carry the round-1 memo as context
		// Refresh broker snapshot so Owen sees fresh pending orders.
		if m.alpaca != nil {
			syncCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_ = m.SyncBroker(syncCtx)
			cancel()
			m.mu.Lock()
			if m.state.Broker.Name != "" {
				bc := m.state.Broker
				round2.Broker = &bc
			}
			m.mu.Unlock()
		}
		round2.OnTurn = in.OnTurn

		var (
			memo2        string
			summary2     string
			decisions2   []Decision
			watchAdd2    []string
			watchRemove2 []string
			conv2        []ConversationTurn
			err2         error
		)
		_, memo2, summary2, decisions2, watchAdd2, watchRemove2, conv2, err2 = Decide(ctx, m.router, round2)
		if err2 == nil {
			m.setPhase("executing", 4, 4, fmt.Sprintf("round 2: %d decisions", len(decisions2)))
			m.mu.Lock()
			now2 := time.Now()
			for i, d := range decisions2 {
				if d.Action == "hold" || d.Qty <= 0 {
					decisions2[i].Executed = false
					if d.Action != "hold" {
						decisions2[i].Rejected = "qty is zero"
					}
					if d.Action == "hold" && (d.TargetPrice > 0 || d.StopPrice > 0 || d.HorizonMin > 0) {
						m.upsertPlanLocked(d, now2, false)
					}
					continue
				}
				q, ok := m.quotes[d.Symbol]
				if !ok || q.Price <= 0 {
					decisions2[i].Rejected = "no quote"
					continue
				}
				_, eerr := m.executeLockedFull(d.Symbol, d.Action, d.Qty, q.Price, d.TargetPrice, d.StopPrice, d.Reason, "agent")
				if eerr != nil {
					decisions2[i].Rejected = eerr.Error()
					continue
				}
				decisions2[i].Executed = true
				switch d.Action {
				case "buy", "add", "short":
					m.upsertPlanLocked(d, now2, true)
				case "sell", "cover":
					if m.findPositionLocked(d.Symbol) == nil {
						m.removePlanLocked(d.Symbol)
					}
				}
			}
			if strings.TrimSpace(memo2) != "" {
				m.state.Memo = strings.TrimSpace(memo2)
			}
			// Apply round-2 watchlist mutations on top of round-1's.
			applyWatchlistChangesLocked(m, watchAdd2, watchRemove2)
			m.state.LastTick = time.Now()
			m.mu.Unlock()

			// Merge round-2 results into the log entry as a separate
			// section the dashboard can render.
			logEntry.Decisions = append(logEntry.Decisions, decisions2...)
			logEntry.Conversation = append(logEntry.Conversation, conv2...)
			if strings.TrimSpace(summary2) != "" {
				logEntry.Summary = strings.TrimSpace(logEntry.Summary + " · " + summary2)
			}
			for _, d := range decisions2 {
				if d.Executed {
					executed++
				}
			}

			// If round-2 still failed on broker/execution constraints,
			// force one more discussion so the team can adapt again.
			rejected2 := collectBrokerRejections(decisions2)
			if len(rejected2) > 0 {
				m.setPhase("rebriefing", 4, 4, fmt.Sprintf("%d rejections — reconvening", len(rejected2)))
				log.Printf("trader: %d rejection(s) remain after round 2, running round 3", len(rejected2))
				round3 := in
				round3.Round = 3
				round3.PriorRejections = rejected2
				round3.Memo = strings.TrimSpace(memo2)
				if m.alpaca != nil {
					syncCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
					_ = m.SyncBroker(syncCtx)
					cancel()
					m.mu.Lock()
					if m.state.Broker.Name != "" {
						bc := m.state.Broker
						round3.Broker = &bc
					}
					m.mu.Unlock()
				}
				round3.OnTurn = in.OnTurn

				_, memo3, summary3, decisions3, watchAdd3, watchRemove3, conv3, err3 := Decide(ctx, m.router, round3)
				if err3 == nil {
					m.setPhase("executing", 4, 4, fmt.Sprintf("round 3: %d decisions", len(decisions3)))
					m.mu.Lock()
					now3 := time.Now()
					for i, d := range decisions3 {
						if d.Action == "hold" || d.Qty <= 0 {
							decisions3[i].Executed = false
							if d.Action != "hold" {
								decisions3[i].Rejected = "qty is zero"
							}
							if d.Action == "hold" && (d.TargetPrice > 0 || d.StopPrice > 0 || d.HorizonMin > 0) {
								m.upsertPlanLocked(d, now3, false)
							}
							continue
						}
						q, ok := m.quotes[d.Symbol]
						if !ok || q.Price <= 0 {
							decisions3[i].Rejected = "no quote"
							continue
						}
						_, eerr := m.executeLockedFull(d.Symbol, d.Action, d.Qty, q.Price, d.TargetPrice, d.StopPrice, d.Reason, "agent")
						if eerr != nil {
							decisions3[i].Rejected = eerr.Error()
							continue
						}
						decisions3[i].Executed = true
						switch d.Action {
						case "buy", "add", "short":
							m.upsertPlanLocked(d, now3, true)
						case "sell", "cover":
							if m.findPositionLocked(d.Symbol) == nil {
								m.removePlanLocked(d.Symbol)
							}
						}
					}
					if strings.TrimSpace(memo3) != "" {
						m.state.Memo = strings.TrimSpace(memo3)
					}
					applyWatchlistChangesLocked(m, watchAdd3, watchRemove3)
					m.state.LastTick = time.Now()
					m.mu.Unlock()

					logEntry.Decisions = append(logEntry.Decisions, decisions3...)
					logEntry.Conversation = append(logEntry.Conversation, conv3...)
					if strings.TrimSpace(summary3) != "" {
						logEntry.Summary = strings.TrimSpace(logEntry.Summary + " · " + summary3)
					}
					for _, d := range decisions3 {
						if d.Executed {
							executed++
						}
					}
				} else {
					log.Printf("trader: round 3 failed: %v", err3)
					logEntry.Conversation = append(logEntry.Conversation, conv3...)
				}
			}
		} else {
			log.Printf("trader: round 2 failed: %v", err2)
			logEntry.Conversation = append(logEntry.Conversation, conv2...)
		}
	}
	// If we routed through a broker, reconcile cash + positions now so the
	// UI reflects fills immediately instead of waiting for the next 30s
	// quote refresh.
	if m.alpaca != nil {
		syncCtx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		_ = m.SyncBroker(syncCtx)
		cancel()
	}
	// Refresh per-symbol short-horizon forecasts (used by the
	// dashboard's position charts). Computed inline against the in-mem
	// price history snapshot — cheap, deterministic, no LLM involved.
	m.refreshForecasts(10)
	// Post-mortem: any positions that fully closed this tick get a
	// one-sentence lesson from the Coach. Best-effort — never blocks
	// the tick on an LLM error.
	m.mu.Lock()
	tradeWindow := 0
	if n := len(m.state.Trades); n > 0 {
		// Look at trades placed in the last 5 minutes (this tick's
		// fills, basically). Coach inspects the symbol's resulting
		// position to decide if anything fully closed.
		cutoff := time.Now().Add(-5 * time.Minute)
		for i := n - 1; i >= 0; i-- {
			if m.state.Trades[i].Time.Before(cutoff) {
				break
			}
			tradeWindow = n - i
		}
	}
	var recent []Trade
	if tradeWindow > 0 {
		recent = append(recent, m.state.Trades[len(m.state.Trades)-tradeWindow:]...)
	}
	m.mu.Unlock()
	if len(recent) > 0 {
		coachCtx, coachCancel := context.WithTimeout(context.Background(), 30*time.Second)
		go func() {
			defer coachCancel()
			m.runCoach(coachCtx, recent)
		}()
	}
	// Research desk: pick up one in_progress research task created by
	// the PM, run a web search, and write findings into the task. Runs
	// in the background so the next tick can react to the findings.
	researchCtx, researchCancel := context.WithTimeout(context.Background(), 45*time.Second)
	go func() {
		defer researchCancel()
		m.runResearchPass(researchCtx)
	}()
	log.Printf("trader: tick done in %s (%d decisions, %d executed)",
		time.Since(start).Round(time.Millisecond), len(logEntry.Decisions), executed)
	m.setPhase("done", 4, 4, fmt.Sprintf("%d executed", executed))
	m.appendLog(logEntry)
}

// refreshForecasts recomputes the short-horizon prediction for every
// symbol on the watchlist OR currently held, and stores the result on
// state.Forecasts. Symbols with too little history are skipped so the
// UI just hides the projection until enough data accumulates.
func (m *Manager) refreshForecasts(horizonH float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	syms := map[string]bool{}
	for _, s := range m.state.Watchlist {
		syms[s] = true
	}
	for _, p := range m.state.Positions {
		syms[p.Symbol] = true
	}
	if m.state.Forecasts == nil {
		m.state.Forecasts = map[string]Forecast{}
	}
	// Drop stale forecasts for symbols we no longer care about.
	for sym := range m.state.Forecasts {
		if !syms[sym] {
			delete(m.state.Forecasts, sym)
		}
	}
	for sym := range syms {
		hist := m.priceHist[sym]
		if len(hist) < 6 {
			delete(m.state.Forecasts, sym)
			continue
		}
		m.state.Forecasts[sym] = ComputeForecast(sym, hist, horizonH, 12)
	}
}

// setPhase updates the in-flight tick status (in-memory only; the next
// state save will persist it). Active is true for every phase except
// "done" and "error".
func (m *Manager) setPhase(phase string, step, total int, msg string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	active := phase != "done" && phase != "error" && phase != ""
	if active && m.state.TickStatus.StartedAt.IsZero() {
		m.state.TickStatus.StartedAt = now
	}
	if !active {
		// keep StartedAt around so the UI can compute total tick duration
	}
	m.state.TickStatus.Active = active
	m.state.TickStatus.Phase = phase
	m.state.TickStatus.Step = step
	m.state.TickStatus.Total = total
	m.state.TickStatus.Message = msg
	m.state.TickStatus.UpdatedAt = now
	if !active {
		// Reset StartedAt for the next tick.
		m.state.TickStatus.StartedAt = time.Time{}
		// Drop the live transcript — finished conversation lives in
		// the AgentLog now, the dashboard sidebar should close.
		m.state.TickStatus.Conversation = nil
	}
	if phase == "refreshing_quotes" && step == 1 {
		// New tick starting — wipe last meeting's live transcript.
		m.state.TickStatus.Conversation = nil
	}
}

// executeLocked applies a single buy/sell to state. Must be called with
// m.mu held. It updates cash, positions, and appends to the trade log
// but does NOT save — the caller is expected to Save once per batch.
//
// When a broker is wired in, we submit a market order to the broker
// instead of mutating cash/positions locally; the next SyncBroker call
// will rehydrate state to reflect the fill.
func (m *Manager) executeLocked(symbol, side string, qty, price float64, reason, source string) (Trade, error) {
	return m.executeLockedFull(symbol, side, qty, price, 0, 0, reason, source)
}

// executeLockedFull is the full version that also accepts a take-profit
// and stop-loss for the broker side. When both are positive and the
// order is a long buy on equities, we submit it as a bracket order so
// the position self-closes when either level trips — even when the
// dashboard is offline or the market is closed for the day.
func (m *Manager) executeLockedFull(symbol, side string, qty, price, takeProfit, stopLoss float64, reason, source string) (Trade, error) {
	if price <= 0 {
		return Trade{}, fmt.Errorf("non-positive price")
	}
	// Normalise long/short verbs into the broker's buy/sell pair, but
	// remember the intent so we can skip the wrong sanity checks.
	intent := strings.ToLower(side)
	brokerSide := intent
	switch intent {
	case "short":
		brokerSide = "sell"
	case "cover":
		brokerSide = "buy"
	case "add":
		// Pyramiding into a winner: economically identical to a buy at
		// the broker, but we keep the "add" label in the trade log so
		// post-mortems can distinguish opens from scale-ins.
		brokerSide = "buy"
	}
	qty = math.Round(qty*10000) / 10000
	total := qty * price
	tr := Trade{
		ID:     genID("trd"),
		Time:   time.Now(),
		Symbol: symbol,
		Side:   intent, // record the human-meaningful side in the log
		Qty:    qty,
		Price:  price,
		Total:  total,
		Reason: reason,
		Source: source,
	}

	// Short / cover require a live broker — simulated mode doesn't model
	// margin, locate, or borrow fees, so we refuse rather than fake it.
	if (intent == "short" || intent == "cover") && m.alpaca == nil {
		return Trade{}, fmt.Errorf("%s requires a live broker (simulated mode is long-only)", intent)
	}
	// Crypto can't be shorted on Alpaca paper.
	if intent == "short" && strings.HasSuffix(strings.ToUpper(symbol), "-USD") {
		return Trade{}, fmt.Errorf("cannot short crypto pair %s on alpaca paper", symbol)
	}

	// ── Broker-backed path ────────────────────────────────────────────
	if m.alpaca != nil {
		// Cash-reserve floor still applies on agent buys (NOT on cover —
		// closing a short returns margin rather than draining cash).
		if (intent == "buy" || intent == "add") && source == "agent" {
			equity := m.state.Cash
			for _, p := range m.state.Positions {
				if q, ok := m.quotes[p.Symbol]; ok && q.Price > 0 {
					equity += p.Qty * q.Price
				} else {
					equity += p.Qty * p.AvgCost
				}
			}
			// Aggressive deployment: only 2% reserve so the agent can
			// commit nearly all capital. Mason (Capital Allocator) is
			// responsible for keeping at least one slot of dry powder.
			reserve := equity * 0.02
			// Use broker BuyingPower as the effective available cash when
			// connected — it already accounts for cash locked by pending
			// buy orders (held_for_orders), so we avoid the "would breach
			// 2% cash reserve" error from double-committing capital.
			effectiveCash := m.state.Cash
			if m.state.Broker.Connected && m.state.Broker.BuyingPower > 0 {
				effectiveCash = m.state.Broker.BuyingPower
			}
			if effectiveCash-total < reserve {
				return Trade{}, fmt.Errorf(
					"would breach 2%% cash reserve (need $%.2f, $%.2f free after reserve)",
					total, effectiveCash-reserve,
				)
			}
		}
		if intent == "sell" {
			pos := m.findPositionLocked(symbol)
			if pos == nil || pos.Qty < qty {
				held := 0.0
				if pos != nil {
					held = pos.Qty
				}
				return Trade{}, fmt.Errorf("not enough shares: have %.4f want %.4f", held, qty)
			}
			// Check qty_available — Alpaca locks shares in bracket exit legs
			// under held_for_orders, so the sellable amount may be less than
			// the total held qty.
			if pos.AvailableQty > 0 && qty > pos.AvailableQty+0.0001 {
				return Trade{}, fmt.Errorf(
					"not enough sellable shares for %s: total=%.4f available=%.4f (%.4f locked in bracket orders)",
					symbol, pos.Qty, pos.AvailableQty, pos.Qty-pos.AvailableQty)
			}
		}
		if intent == "cover" {
			pos := m.findPositionLocked(symbol)
			shortQty := 0.0
			if pos != nil && pos.Qty < 0 {
				shortQty = -pos.Qty
			}
			if shortQty <= 0 {
				return Trade{}, fmt.Errorf("no open short on %s to cover", symbol)
			}
			if qty > shortQty+0.0001 {
				return Trade{}, fmt.Errorf("cover qty %.4f exceeds open short %.4f", qty, shortQty)
			}
		}
		// Release the lock for the network call — callers re-check state
		// after Save() anyway, and SyncBroker will reconcile shortly.
		m.mu.Unlock()
		submitCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		ord, err := m.submitBrokerOrder(submitCtx, symbol, intent, brokerSide, qty, price, takeProfit, stopLoss)
		cancel()
		if err == nil && ord != nil && ord.ID != "" {
			// Market orders normally fill in <1s; poll briefly so we
			// can record the actual filled qty + avg price (and catch
			// rejections instead of pretending the trade happened).
			pollCtx, pcancel := context.WithTimeout(context.Background(), 8*time.Second)
			if final, perr := m.alpaca.WaitForOrder(pollCtx, ord.ID, 300*time.Millisecond); perr == nil && final != nil {
				ord = final
			}
			pcancel()
		}
		m.mu.Lock()
		if err != nil {
			return Trade{}, fmt.Errorf("alpaca order: %w", err)
		}
		status := strings.ToLower(ord.Status)
		switch status {
		case "rejected", "canceled", "cancelled", "expired":
			return Trade{}, fmt.Errorf("alpaca order %s: %s", ord.ID, status)
		}
		filledQty, _ := strconv.ParseFloat(ord.FilledQty, 64)
		filledAvg, _ := strconv.ParseFloat(ord.FilledAvg, 64)
		if filledQty <= 0 {
			// Order accepted but not yet filled — record as a 0-qty
			// pending entry so it's visible in the log, but don't
			// invent fills. SyncBroker will catch it on the next pass.
			return Trade{}, fmt.Errorf("alpaca order %s still %s (no fill yet)", ord.ID, ord.Status)
		}
		tr.Qty = filledQty
		if filledAvg > 0 {
			tr.Price = filledAvg
		}
		tr.Total = tr.Qty * tr.Price
		if status == "partially_filled" {
			tr.Reason = strings.TrimSpace(tr.Reason + " [partial " + ord.FilledQty + "/" + ord.Qty + "]")
		}
		m.state.Trades = append(m.state.Trades, tr)
		if len(m.state.Trades) > 500 {
			m.state.Trades = m.state.Trades[len(m.state.Trades)-500:]
		}
		return tr, nil
	}

	// ── Simulated path ────────────────────────────────────────────────
	switch side {
	case "buy", "add":
		if total > m.state.Cash {
			return Trade{}, fmt.Errorf("insufficient cash: need $%.2f have $%.2f", total, m.state.Cash)
		}
		// Cash-reserve floor: the agent (NOT manual trades) must leave at
		// least 2% of total equity in cash so it always has dry powder for
		// the next opportunity. Mason owns the deployment target.
		if source == "agent" {
			equity := m.state.Cash
			for _, p := range m.state.Positions {
				if q, ok := m.quotes[p.Symbol]; ok && q.Price > 0 {
					equity += p.Qty * q.Price
				} else {
					equity += p.Qty * p.AvgCost
				}
			}
			reserve := equity * 0.02
			if m.state.Cash-total < reserve {
				return Trade{}, fmt.Errorf(
					"would breach 2%% cash reserve (need $%.2f, $%.2f free after reserve)",
					total, m.state.Cash-reserve,
				)
			}
		}
		m.state.Cash -= total
		m.upsertPositionLocked(symbol, qty, price)
	case "sell":
		pos := m.findPositionLocked(symbol)
		if pos == nil || pos.Qty < qty {
			held := 0.0
			if pos != nil {
				held = pos.Qty
			}
			return Trade{}, fmt.Errorf("not enough shares: have %.4f want %.4f", held, qty)
		}
		realised := (price - pos.AvgCost) * qty
		tr.Realised = realised
		m.state.Cash += total
		pos.Qty -= qty
		if pos.Qty <= 0.00001 {
			m.removePositionLocked(symbol)
		}
	default:
		return Trade{}, fmt.Errorf("invalid side %q", side)
	}
	m.state.Trades = append(m.state.Trades, tr)
	// Cap trade history at 500 entries to keep the JSON file modest.
	if len(m.state.Trades) > 500 {
		m.state.Trades = m.state.Trades[len(m.state.Trades)-500:]
	}
	return tr, nil
}

func (m *Manager) upsertPositionLocked(symbol string, qty, price float64) {
	for i, p := range m.state.Positions {
		if p.Symbol == symbol {
			totalQty := p.Qty + qty
			totalCost := p.AvgCost*p.Qty + price*qty
			m.state.Positions[i].Qty = totalQty
			if totalQty > 0 {
				m.state.Positions[i].AvgCost = totalCost / totalQty
			}
			return
		}
	}
	m.state.Positions = append(m.state.Positions, Position{
		Symbol:  symbol,
		Qty:     qty,
		AvgCost: price,
	})
}

func (m *Manager) findPositionLocked(symbol string) *Position {
	for i := range m.state.Positions {
		if m.state.Positions[i].Symbol == symbol {
			return &m.state.Positions[i]
		}
	}
	return nil
}

func (m *Manager) removePositionLocked(symbol string) {
	out := m.state.Positions[:0]
	for _, p := range m.state.Positions {
		if p.Symbol != symbol {
			out = append(out, p)
		}
	}
	m.state.Positions = out
}

// upsertPlanLocked creates or refreshes the open plan for a symbol. When
// 'fromBuy' is true and a plan already exists we keep the original
// OpenedAt timestamp so we can track how long a thesis has been held.
func (m *Manager) upsertPlanLocked(d Decision, now time.Time, fromBuy bool) {
	for i := range m.state.Plans {
		if m.state.Plans[i].Symbol == d.Symbol {
			p := &m.state.Plans[i]
			if strings.TrimSpace(d.Reason) != "" {
				p.Thesis = d.Reason
			}
			if d.HorizonMin > 0 {
				p.HorizonMin = d.HorizonMin
			}
			if d.TargetPrice > 0 {
				p.TargetPrice = d.TargetPrice
			}
			if d.StopPrice > 0 {
				p.StopPrice = d.StopPrice
			}
			if d.Confidence > 0 {
				p.Confidence = d.Confidence
			}
			p.UpdatedAt = now
			return
		}
	}
	if !fromBuy {
		return
	}
	m.state.Plans = append(m.state.Plans, PositionPlan{
		Symbol:      d.Symbol,
		Thesis:      d.Reason,
		HorizonMin:  d.HorizonMin,
		TargetPrice: d.TargetPrice,
		StopPrice:   d.StopPrice,
		Confidence:  d.Confidence,
		OpenedAt:    now,
		UpdatedAt:   now,
	})
}

func (m *Manager) removePlanLocked(symbol string) {
	out := m.state.Plans[:0]
	for _, p := range m.state.Plans {
		if p.Symbol != symbol {
			out = append(out, p)
		}
	}
	m.state.Plans = out
}

func (m *Manager) appendLog(entry AgentLog) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.state.Logs = append(m.state.Logs, entry)
	if len(m.state.Logs) > 200 {
		m.state.Logs = m.state.Logs[len(m.state.Logs)-200:]
	}
	_ = m.store.Save(m.state)
}

// Bars returns OHLCV history for a symbol, caching per (symbol,timeframe)
// for 15 minutes so we don't hammer Alpaca on every dashboard poll.
// Requires a live Alpaca client; returns an error if simulated-only.
func (m *Manager) Bars(ctx context.Context, symbol, timeframe string) ([]HistoricalBar, error) {
	if m.alpaca == nil {
		return nil, fmt.Errorf("historical bars require a live Alpaca client")
	}
	sym := strings.ToUpper(strings.TrimSpace(symbol))
	tf := strings.TrimSpace(timeframe)
	if tf == "" {
		tf = "1Hour"
	}
	key := sym + "|" + tf
	m.mu.Lock()
	if entry, ok := m.barCache[key]; ok && time.Since(entry.fetchedAt) < 15*time.Minute {
		m.mu.Unlock()
		return entry.bars, nil
	}
	m.mu.Unlock()
	bars, err := m.alpaca.Bars(ctx, sym, tf, time.Time{}, 0)
	if err != nil {
		return nil, err
	}
	m.mu.Lock()
	m.barCache[key] = barCacheEntry{bars: bars, fetchedAt: time.Now()}
	m.mu.Unlock()
	return bars, nil
}

// submitBrokerOrder picks the right Alpaca endpoint based on intent,
// asset type, and session phase. For long entries on equities with both
// a take-profit and a stop-loss it submits a bracket order so the
// position self-exits at the planned levels. Outside regular trading
// hours equities go in as marketable limits with extended_hours=true
// (Alpaca rejects market orders outside RTH). Crypto and shorts always
// go through PlaceMarketOrder.
func (m *Manager) submitBrokerOrder(
	ctx context.Context,
	symbol, intent, brokerSide string,
	qty, price, takeProfit, stopLoss float64,
) (*AlpacaOrder, error) {
	isCrypto := strings.HasSuffix(strings.ToUpper(symbol), "-USD")
	alpacaSym := AlpacaSymbol(symbol)

	if isCrypto {
		return m.alpaca.PlaceMarketOrder(ctx, alpacaSym, brokerSide, qty)
	}

	// Determine if we're in regular US trading hours. Bracket orders
	// only fire during RTH; extended-hours orders MUST be limits.
	isRTH := false
	for _, s := range MarketSessions(time.Now()) {
		if s.Name == "US" && s.Open {
			isRTH = true
			break
		}
	}

	// Equity LONG entry (buy / add / cover) — try a bracket if we
	// have the levels and we're in RTH. Otherwise plain market in RTH,
	// or extended-hours limit outside RTH.
	if intent == "buy" || intent == "add" || intent == "cover" {
		if isRTH && intent != "cover" && takeProfit > 0 && stopLoss > 0 &&
			takeProfit > price && stopLoss < price {
			return m.alpaca.PlaceBracketBuy(ctx, alpacaSym, qty, takeProfit, stopLoss)
		}
		if !isRTH {
			// Cross the spread by 0.5% so the limit is marketable.
			limit := price * 1.005
			return m.alpaca.PlaceExtendedHoursBuy(ctx, alpacaSym, qty, limit)
		}
		return m.alpaca.PlaceMarketOrder(ctx, alpacaSym, brokerSide, qty)
	}

	// Equity SELL / SHORT — same logic, just no bracket attachment.
	if !isRTH {
		limit := price * 0.995
		return m.alpaca.PlaceExtendedHoursSell(ctx, alpacaSym, qty, limit)
	}
	return m.alpaca.PlaceMarketOrder(ctx, alpacaSym, brokerSide, qty)
}
