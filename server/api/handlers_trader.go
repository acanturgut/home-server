package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/acanturgut/home-server/trader"
)

// SetTrader wires the paper-trading manager.
func (h *Handler) SetTrader(m *trader.Manager) { h.trader = m }

// stateResp is what GET /api/trader/state returns. We bundle the
// persisted State with live quotes/news plus derived equity/P/L so the
// dashboard can render a single snapshot without follow-up requests.
type traderStateResp struct {
	*trader.State
	Quotes       []trader.Quote                  `json:"quotes"`
	News         []trader.NewsItem               `json:"news"`
	PriceHistory map[string][]trader.PricePoint  `json:"price_history"`
	Equity       float64                         `json:"equity"`
	PL           float64                         `json:"pl"`
	Stats        traderStats                     `json:"stats"`
	Sessions     []trader.MarketSession          `json:"sessions"`
}

// traderStats are read-only derived metrics for the dashboard so the UI
// doesn't have to recompute them. All fields are best-effort.
type traderStats struct {
	TotalTrades   int     `json:"total_trades"`
	BuyCount      int     `json:"buy_count"`
	SellCount     int     `json:"sell_count"`
	Wins          int     `json:"wins"`
	Losses        int     `json:"losses"`
	WinRate       float64 `json:"win_rate"`
	RealisedPL    float64 `json:"realised_pl"`
	UnrealisedPL  float64 `json:"unrealised_pl"`
	BestSymbol    string  `json:"best_symbol,omitempty"`
	BestSymbolPL  float64 `json:"best_symbol_pl"`
	WorstSymbol   string  `json:"worst_symbol,omitempty"`
	WorstSymbolPL float64 `json:"worst_symbol_pl"`
	PositionsVal  float64 `json:"positions_value"`
}

// GET /api/trader/state
func (h *Handler) TraderState(w http.ResponseWriter, _ *http.Request) {
	if h.trader == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "trader disabled"})
		return
	}
	st, quotes, news, priceHist, equity, pl := h.trader.State()
	// Downsample the per-symbol price history before serialisation —
	// in-memory we keep up to ~2880 samples per symbol (~8h at 10s),
	// but the dashboard only needs ~240 to render a smooth line, and
	// shipping 30 × 2880 points per poll would balloon the payload.
	priceHist = downsamplePriceHistory(priceHist, 240)
	// NEVER ship the raw broker secret to the dashboard. Replace with the
	// masked version (last 4 chars only). The UI fetches the full masked
	// config from /api/trader/alpaca anyway.
	if st.BrokerConfig.Secret != "" {
		st.BrokerConfig = h.trader.AlpacaConfig()
	}
	writeJSON(w, http.StatusOK, traderStateResp{
		State:        st,
		Quotes:       quotes,
		News:         news,
		PriceHistory: priceHist,
		Equity:       equity,
		PL:           pl,
		Stats:        computeTraderStats(st, quotes),
		Sessions:     trader.MarketSessions(time.Now()),
	})
}

// computeTraderStats derives win-rate, realised P/L per symbol, etc.
func computeTraderStats(st *trader.State, quotes []trader.Quote) traderStats {
	stats := traderStats{}
	priceBySym := map[string]float64{}
	for _, q := range quotes {
		priceBySym[q.Symbol] = q.Price
	}
	plBySym := map[string]float64{}
	for _, t := range st.Trades {
		stats.TotalTrades++
		switch t.Side {
		case "buy":
			stats.BuyCount++
		case "sell":
			stats.SellCount++
			if t.Realised > 0 {
				stats.Wins++
			} else if t.Realised < 0 {
				stats.Losses++
			}
			stats.RealisedPL += t.Realised
			plBySym[t.Symbol] += t.Realised
		}
	}
	if closed := stats.Wins + stats.Losses; closed > 0 {
		stats.WinRate = float64(stats.Wins) / float64(closed) * 100
	}
	for _, p := range st.Positions {
		last := priceBySym[p.Symbol]
		if last <= 0 {
			last = p.AvgCost
		}
		unreal := (last - p.AvgCost) * p.Qty
		stats.UnrealisedPL += unreal
		stats.PositionsVal += last * p.Qty
		plBySym[p.Symbol] += unreal
	}
	for sym, pl := range plBySym {
		if stats.BestSymbol == "" || pl > stats.BestSymbolPL {
			stats.BestSymbol = sym
			stats.BestSymbolPL = pl
		}
		if stats.WorstSymbol == "" || pl < stats.WorstSymbolPL {
			stats.WorstSymbol = sym
			stats.WorstSymbolPL = pl
		}
	}
	return stats
}

// POST /api/trader/start
func (h *Handler) TraderStart(w http.ResponseWriter, _ *http.Request) {
	if h.trader == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "trader disabled"})
		return
	}
	if err := h.trader.Start(); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/trader/stop
func (h *Handler) TraderStop(w http.ResponseWriter, _ *http.Request) {
	if h.trader == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "trader disabled"})
		return
	}
	if err := h.trader.Stop(); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/trader/tick — fire a tick immediately (debug / "Run now").
func (h *Handler) TraderTick(w http.ResponseWriter, _ *http.Request) {
	if h.trader == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "trader disabled"})
		return
	}
	h.trader.TriggerTick()
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type traderAmountReq struct {
	Amount float64 `json:"amount"`
}

// POST /api/trader/deposit
func (h *Handler) TraderDeposit(w http.ResponseWriter, r *http.Request) {
	if h.trader == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "trader disabled"})
		return
	}
	var in traderAmountReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if err := h.trader.Deposit(in.Amount); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/trader/withdraw
func (h *Handler) TraderWithdraw(w http.ResponseWriter, r *http.Request) {
	if h.trader == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "trader disabled"})
		return
	}
	var in traderAmountReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if err := h.trader.Withdraw(in.Amount); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/trader/reset
func (h *Handler) TraderReset(w http.ResponseWriter, _ *http.Request) {
	if h.trader == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "trader disabled"})
		return
	}
	if err := h.trader.Reset(); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type traderWatchlistReq struct {
	Symbols  []string `json:"symbols"`
	Interval int      `json:"interval_min"`
}

// POST /api/trader/watchlist — updates symbols and optionally the tick interval.
func (h *Handler) TraderWatchlist(w http.ResponseWriter, r *http.Request) {
	if h.trader == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "trader disabled"})
		return
	}
	var in traderWatchlistReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if len(in.Symbols) > 0 {
		if err := h.trader.SetWatchlist(in.Symbols); err != nil {
			writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
			return
		}
	}
	if in.Interval > 0 {
		if err := h.trader.SetInterval(in.Interval); err != nil {
			writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type traderTradeReq struct {
	Symbol string  `json:"symbol"`
	Side   string  `json:"side"`
	Qty    float64 `json:"qty"`
}

// POST /api/trader/trade — manual buy/sell at current market price.
func (h *Handler) TraderManualTrade(w http.ResponseWriter, r *http.Request) {
	if h.trader == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "trader disabled"})
		return
	}
	var in traderTradeReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	tr, err := h.trader.ManualTrade(in.Symbol, in.Side, in.Qty)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, tr)
}

// GET /api/trader/quotes?symbols=AAPL,MSFT — live fetch on demand.
func (h *Handler) TraderQuotes(w http.ResponseWriter, r *http.Request) {
	if h.trader == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "trader disabled"})
		return
	}
	symbols := strings.Split(r.URL.Query().Get("symbols"), ",")
	quotes, err := trader.FetchQuotes(r.Context(), symbols)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, quotes)
}

// GET /api/trader/news?symbols=AAPL,MSFT&per=3
func (h *Handler) TraderNews(w http.ResponseWriter, r *http.Request) {
	if h.trader == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "trader disabled"})
		return
	}
	symbols := strings.Split(r.URL.Query().Get("symbols"), ",")
	per, _ := strconv.Atoi(r.URL.Query().Get("per"))
	if per <= 0 {
		per = 3
	}
	items, err := h.trader.RefreshNews(r.Context(), symbols, per)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// ─── Alpaca broker settings ─────────────────────────────────────────────────

type alpacaConfigReq struct {
	KeyID   string `json:"key_id"`
	Secret  string `json:"secret"`
	BaseURL string `json:"base_url"`
}

type alpacaConfigResp struct {
	Enabled bool   `json:"enabled"`
	Name    string `json:"name"`
	KeyID   string `json:"key_id"`
	Secret  string `json:"secret"` // masked
	BaseURL string `json:"base_url"`
}

// GET /api/trader/alpaca — current persisted broker config (secret masked).
func (h *Handler) TraderAlpacaGet(w http.ResponseWriter, _ *http.Request) {
	if h.trader == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "trader disabled"})
		return
	}
	cfg := h.trader.AlpacaConfig()
	writeJSON(w, http.StatusOK, alpacaConfigResp{
		Enabled: cfg.Enabled,
		Name:    cfg.Name,
		KeyID:   cfg.KeyID,
		Secret:  cfg.Secret, // already masked by AlpacaConfig()
		BaseURL: cfg.BaseURL,
	})
}

// POST /api/trader/alpaca — validate + persist credentials. Empty body
// values are rejected here (use DELETE to disconnect).
func (h *Handler) TraderAlpacaSet(w http.ResponseWriter, r *http.Request) {
	if h.trader == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "trader disabled"})
		return
	}
	var in alpacaConfigReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	in.KeyID = strings.TrimSpace(in.KeyID)
	in.Secret = strings.TrimSpace(in.Secret)
	in.BaseURL = strings.TrimSpace(in.BaseURL)
	if in.KeyID == "" || in.Secret == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "key_id and secret are required"})
		return
	}
	if err := h.trader.SetAlpacaConfig(r.Context(), in.KeyID, in.Secret, in.BaseURL); err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/trader/alpaca/test — try the supplied credentials WITHOUT
// persisting. Returns the basic account snapshot on success so the UI
// can show "$100k buying power detected" before the user clicks Save.
func (h *Handler) TraderAlpacaTest(w http.ResponseWriter, r *http.Request) {
	if h.trader == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "trader disabled"})
		return
	}
	var in alpacaConfigReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	acct, err := h.trader.TestAlpaca(r.Context(), in.KeyID, in.Secret, in.BaseURL)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":            true,
		"account_id":    acct.ID,
		"status":        acct.Status,
		"currency":      acct.Currency,
		"cash":          acct.Cash,
		"equity":        acct.Equity,
		"buying_power":  acct.BuyingPower,
	})
}

// DELETE /api/trader/alpaca — disconnect the broker. Local state is kept.
func (h *Handler) TraderAlpacaClear(w http.ResponseWriter, _ *http.Request) {
	if h.trader == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "trader disabled"})
		return
	}
	if err := h.trader.ClearAlpacaConfig(); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// downsamplePriceHistory returns a copy of the per-symbol price history
// where each series is reduced to at most `maxPoints` evenly-spaced
// samples. The most recent sample is ALWAYS preserved so the chart's
// right edge stays accurate even under aggressive downsampling.
func downsamplePriceHistory(in map[string][]trader.PricePoint, maxPoints int) map[string][]trader.PricePoint {
	if maxPoints < 2 {
		maxPoints = 2
	}
	out := make(map[string][]trader.PricePoint, len(in))
	for sym, pts := range in {
		n := len(pts)
		if n <= maxPoints {
			out[sym] = pts
			continue
		}
		stride := float64(n-1) / float64(maxPoints-1)
		ds := make([]trader.PricePoint, 0, maxPoints)
		for i := 0; i < maxPoints-1; i++ {
			idx := int(float64(i) * stride)
			if idx >= n {
				idx = n - 1
			}
			ds = append(ds, pts[idx])
		}
		// Always include the most recent sample.
		ds = append(ds, pts[n-1])
		out[sym] = ds
	}
	return out
}

// GET /api/trader/bars?symbol=AAPL&timeframe=1Hour
func (h *Handler) TraderBars(w http.ResponseWriter, r *http.Request) {
	if h.trader == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "trader disabled"})
		return
	}
	q := r.URL.Query()
	sym := strings.ToUpper(strings.TrimSpace(q.Get("symbol")))
	if sym == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "symbol required"})
		return
	}
	tf := strings.TrimSpace(q.Get("timeframe"))
	if tf == "" {
		tf = "1Hour"
	}
	bars, err := h.trader.Bars(r.Context(), sym, tf)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"symbol":    sym,
		"timeframe": tf,
		"bars":      bars,
	})
}

// POST /api/trader/tasks
// Body: {title, description?, kind?, assigned_to?, symbol?, priority?}
func (h *Handler) TraderTaskCreate(w http.ResponseWriter, r *http.Request) {
	if h.trader == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "trader disabled"})
		return
	}
	var body struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		Kind        string `json:"kind"`
		AssignedTo  string `json:"assigned_to"`
		Symbol      string `json:"symbol"`
		Priority    string `json:"priority"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid JSON"})
		return
	}
	t, err := h.trader.CreateTask(body.Title, body.Description, body.Kind, body.AssignedTo, body.Symbol, body.Priority)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, t)
}

// POST /api/trader/tasks/move
// Body: {id, to_status, note?}
func (h *Handler) TraderTaskMove(w http.ResponseWriter, r *http.Request) {
	if h.trader == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "trader disabled"})
		return
	}
	var body struct {
		ID       string `json:"id"`
		ToStatus string `json:"to_status"`
		Note     string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid JSON"})
		return
	}
	t, err := h.trader.MoveTask(body.ID, body.ToStatus, body.Note)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, t)
}
