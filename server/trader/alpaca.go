package trader

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// AlpacaClient is a thin REST client for Alpaca's paper-trading API.
//
// We intentionally implement only the handful of endpoints the trader
// needs (account, positions, orders, liquidate-all) instead of pulling
// in a heavyweight SDK.
//
// Docs: https://docs.alpaca.markets/reference
type AlpacaClient struct {
	keyID   string
	secret  string
	baseURL string // e.g. https://paper-api.alpaca.markets
	hc      *http.Client
}

// NewAlpacaFromEnv returns an AlpacaClient configured from environment
// variables, or nil if either credential is unset (so the trader
// silently falls back to fully-simulated mode in dev).
//
//	ALPACA_KEY_ID
//	ALPACA_SECRET_KEY
//	ALPACA_BASE_URL  (optional, defaults to paper)
func NewAlpacaFromEnv() *AlpacaClient {
	key := strings.TrimSpace(os.Getenv("ALPACA_KEY_ID"))
	sec := strings.TrimSpace(os.Getenv("ALPACA_SECRET_KEY"))
	if key == "" || sec == "" {
		return nil
	}
	base := strings.TrimSpace(os.Getenv("ALPACA_BASE_URL"))
	return NewAlpaca(key, sec, base)
}

// NewAlpaca builds a client from explicit credentials. Used by the
// settings UI / persisted config. baseURL may be empty (defaults to
// paper).
func NewAlpaca(keyID, secret, baseURL string) *AlpacaClient {
	keyID = strings.TrimSpace(keyID)
	secret = strings.TrimSpace(secret)
	if keyID == "" || secret == "" {
		return nil
	}
	base := strings.TrimSpace(baseURL)
	if base == "" {
		base = "https://paper-api.alpaca.markets"
	}
	return &AlpacaClient{
		keyID:   keyID,
		secret:  secret,
		baseURL: strings.TrimRight(base, "/"),
		hc:      &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *AlpacaClient) do(ctx context.Context, method, path string, body any, out any) error {
	return c.doHost(ctx, method, c.baseURL+path, body, out)
}

// doHost is like do but takes a full URL, so callers can hit non-broker
// hosts like data.alpaca.markets which is on a different domain.
func (c *AlpacaClient) doHost(ctx context.Context, method, fullURL string, body any, out any) error {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, fullURL, rdr)
	if err != nil {
		return err
	}
	req.Header.Set("APCA-API-KEY-ID", c.keyID)
	req.Header.Set("APCA-API-SECRET-KEY", c.secret)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("alpaca %s %s: %d %s", method, fullURL, resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	if out == nil || len(raw) == 0 {
		return nil
	}
	return json.Unmarshal(raw, out)
}

// AlpacaAccount is the subset of /v2/account we consume.
type AlpacaAccount struct {
	ID            string `json:"id"`
	Status        string `json:"status"`
	Currency      string `json:"currency"`
	Cash          string `json:"cash"`
	Equity        string `json:"equity"`
	BuyingPower   string `json:"buying_power"`
	PortfolioVal  string `json:"portfolio_value"`
	PatternDayTr  bool   `json:"pattern_day_trader"`
	TradingBlock  bool   `json:"trading_blocked"`
	AccountBlock  bool   `json:"account_blocked"`
}

func (c *AlpacaClient) Account(ctx context.Context) (*AlpacaAccount, error) {
	var a AlpacaAccount
	if err := c.do(ctx, http.MethodGet, "/v2/account", nil, &a); err != nil {
		return nil, err
	}
	return &a, nil
}

// AlpacaPosition is the subset of /v2/positions we consume.
type AlpacaPosition struct {
	Symbol        string `json:"symbol"`
	AssetClass    string `json:"asset_class"`
	Qty           string `json:"qty"`
	QtyAvailable  string `json:"qty_available"` // qty minus held_for_orders (bracket legs etc.)
	AvgEntryPrice string `json:"avg_entry_price"`
	CurrentPrice  string `json:"current_price"`
	MarketValue   string `json:"market_value"`
	UnrealizedPL  string `json:"unrealized_pl"`
}

func (c *AlpacaClient) Positions(ctx context.Context) ([]AlpacaPosition, error) {
	var ps []AlpacaPosition
	if err := c.do(ctx, http.MethodGet, "/v2/positions", nil, &ps); err != nil {
		return nil, err
	}
	return ps, nil
}

// PlaceMarketOrder submits a simple market order. Uses fractional shares
// for stocks (qty as decimal), GTC for crypto, DAY for equities.
type alpacaOrderLeg struct {
	LimitPrice string `json:"limit_price,omitempty"`
	StopPrice  string `json:"stop_price,omitempty"`
}

type alpacaOrderReq struct {
	Symbol         string          `json:"symbol"`
	Qty            string          `json:"qty"`
	Side           string          `json:"side"`
	Type           string          `json:"type"`
	TimeInForce    string          `json:"time_in_force"`
	LimitPrice     string          `json:"limit_price,omitempty"`
	ExtendedHours  bool            `json:"extended_hours,omitempty"`
	OrderClass     string          `json:"order_class,omitempty"`
	TakeProfit     *alpacaOrderLeg `json:"take_profit,omitempty"`
	StopLoss       *alpacaOrderLeg `json:"stop_loss,omitempty"`
	ClientOrderID  string          `json:"client_order_id,omitempty"`
}

type AlpacaOrder struct {
	ID          string    `json:"id"`
	ClientID    string    `json:"client_order_id"`
	Symbol      string    `json:"symbol"`
	Qty         string    `json:"qty"`
	FilledQty   string    `json:"filled_qty"`
	FilledAvg   string    `json:"filled_avg_price"`
	Side        string    `json:"side"`
	Status      string    `json:"status"`
	Type        string    `json:"type"`
	AssetClass  string    `json:"asset_class"`
	SubmittedAt time.Time `json:"submitted_at"`
}

// PlaceMarketOrder submits a market order. `symbol` should be in Alpaca
// format (equity ticker like "AAPL" or crypto pair like "BTC/USD").
func (c *AlpacaClient) PlaceMarketOrder(ctx context.Context, symbol, side string, qty float64) (*AlpacaOrder, error) {
	tif := "day"
	if strings.Contains(symbol, "/") { // crypto
		tif = "gtc"
	}
	req := alpacaOrderReq{
		Symbol:      symbol,
		Qty:         fmt.Sprintf("%.6f", qty),
		Side:        strings.ToLower(side),
		Type:        "market",
		TimeInForce: tif,
	}
	var o AlpacaOrder
	if err := c.do(ctx, http.MethodPost, "/v2/orders", req, &o); err != nil {
		return nil, err
	}
	return &o, nil
}

// PlaceBracketBuy submits a bracket entry: a market BUY plus an attached
// take-profit (limit) and stop-loss (stop) so the position self-closes
// when either level is hit. Equities-only on Alpaca paper; crypto and
// shorts use PlaceMarketOrder. If takeProfit/stopLoss are non-positive
// we degrade silently into a plain market buy.
func (c *AlpacaClient) PlaceBracketBuy(ctx context.Context, symbol string, qty, takeProfit, stopLoss float64) (*AlpacaOrder, error) {
	if strings.Contains(symbol, "/") {
		return nil, fmt.Errorf("bracket orders not supported for crypto (%s)", symbol)
	}
	if takeProfit <= 0 || stopLoss <= 0 {
		return c.PlaceMarketOrder(ctx, symbol, "buy", qty)
	}
	req := alpacaOrderReq{
		Symbol:      symbol,
		Qty:         fmt.Sprintf("%.6f", qty),
		Side:        "buy",
		Type:        "market",
		TimeInForce: "day",
		OrderClass:  "bracket",
		TakeProfit:  &alpacaOrderLeg{LimitPrice: fmt.Sprintf("%.2f", takeProfit)},
		StopLoss:    &alpacaOrderLeg{StopPrice: fmt.Sprintf("%.2f", stopLoss)},
	}
	var o AlpacaOrder
	if err := c.do(ctx, http.MethodPost, "/v2/orders", req, &o); err != nil {
		return nil, err
	}
	return &o, nil
}

// PlaceExtendedHoursBuy submits a marketable limit buy with
// extended_hours=true, allowing pre/post-market fills (Alpaca rejects
// market orders outside RTH but accepts limits with this flag).
// limitPrice should be ~0.5% above the last quote so it crosses the spread.
func (c *AlpacaClient) PlaceExtendedHoursBuy(ctx context.Context, symbol string, qty, limitPrice float64) (*AlpacaOrder, error) {
	if strings.Contains(symbol, "/") {
		return nil, fmt.Errorf("extended hours only applies to equities (%s)", symbol)
	}
	req := alpacaOrderReq{
		Symbol:        symbol,
		Qty:           fmt.Sprintf("%.6f", qty),
		Side:          "buy",
		Type:          "limit",
		TimeInForce:   "day",
		LimitPrice:    fmt.Sprintf("%.2f", limitPrice),
		ExtendedHours: true,
	}
	var o AlpacaOrder
	if err := c.do(ctx, http.MethodPost, "/v2/orders", req, &o); err != nil {
		return nil, err
	}
	return &o, nil
}

// PlaceExtendedHoursSell mirrors the buy side for closing positions
// during pre/post-market.
func (c *AlpacaClient) PlaceExtendedHoursSell(ctx context.Context, symbol string, qty, limitPrice float64) (*AlpacaOrder, error) {
	if strings.Contains(symbol, "/") {
		return nil, fmt.Errorf("extended hours only applies to equities (%s)", symbol)
	}
	req := alpacaOrderReq{
		Symbol:        symbol,
		Qty:           fmt.Sprintf("%.6f", qty),
		Side:          "sell",
		Type:          "limit",
		TimeInForce:   "day",
		LimitPrice:    fmt.Sprintf("%.2f", limitPrice),
		ExtendedHours: true,
	}
	var o AlpacaOrder
	if err := c.do(ctx, http.MethodPost, "/v2/orders", req, &o); err != nil {
		return nil, err
	}
	return &o, nil
}
func (c *AlpacaClient) GetOrder(ctx context.Context, id string) (*AlpacaOrder, error) {
	var o AlpacaOrder
	if err := c.do(ctx, http.MethodGet, "/v2/orders/"+id, nil, &o); err != nil {
		return nil, err
	}
	return &o, nil
}

// OpenOrders returns all currently open (unfilled) orders.
func (c *AlpacaClient) OpenOrders(ctx context.Context) ([]AlpacaOrder, error) {
	var os []AlpacaOrder
	if err := c.do(ctx, http.MethodGet, "/v2/orders?status=open&limit=50", nil, &os); err != nil {
		return nil, err
	}
	return os, nil
}

// CancelOrder cancels a single open order by id.
func (c *AlpacaClient) CancelOrder(ctx context.Context, id string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("order id is required")
	}
	return c.do(ctx, http.MethodDelete, "/v2/orders/"+id, nil, nil)
}

// WaitForOrder polls GetOrder until it reaches a terminal state
// (filled, canceled, rejected, expired) or the context expires.
// Returns the last order snapshot we saw (which may still be open if
// we timed out).
func (c *AlpacaClient) WaitForOrder(ctx context.Context, id string, pollEvery time.Duration) (*AlpacaOrder, error) {
	if pollEvery <= 0 {
		pollEvery = 250 * time.Millisecond
	}
	var last *AlpacaOrder
	for {
		o, err := c.GetOrder(ctx, id)
		if err != nil {
			if last != nil {
				return last, err
			}
			return nil, err
		}
		last = o
		switch strings.ToLower(o.Status) {
		case "filled", "canceled", "cancelled", "rejected", "expired", "done_for_day":
			return o, nil
		}
		select {
		case <-ctx.Done():
			return last, ctx.Err()
		case <-time.After(pollEvery):
		}
	}
}

// CancelAllOrders cancels every open order.
func (c *AlpacaClient) CancelAllOrders(ctx context.Context) error {
	return c.do(ctx, http.MethodDelete, "/v2/orders", nil, nil)
}

// CloseAllPositions liquidates the entire portfolio at market.
func (c *AlpacaClient) CloseAllPositions(ctx context.Context) error {
	return c.do(ctx, http.MethodDelete, "/v2/positions?cancel_orders=true", nil, nil)
}

// AlpacaSymbol converts our internal ticker form to Alpaca's expected
// format. Currently only crypto needs translation: "BTC-USD" → "BTC/USD".
func AlpacaSymbol(sym string) string {
	s := strings.ToUpper(strings.TrimSpace(sym))
	if strings.HasSuffix(s, "-USD") {
		return strings.TrimSuffix(s, "-USD") + "/USD"
	}
	return s
}

// FromAlpacaSymbol is the inverse of AlpacaSymbol.
func FromAlpacaSymbol(sym string) string {
	s := strings.ToUpper(strings.TrimSpace(sym))
	if strings.HasSuffix(s, "/USD") {
		return strings.TrimSuffix(s, "/USD") + "-USD"
	}
	return s
}

// ─── Market data ──────────────────────────────────────────────────────────
//
// The market-data host is separate from the broker host. The same API
// keys authenticate both. Free-tier accounts get IEX-feed data (15-min
// delayed during market hours per Alpaca's TOS, but the latest-trade
// endpoint still returns the most recent fill we have access to).

const alpacaDataHost = "https://data.alpaca.markets"

type alpacaBar struct {
	T string  `json:"t"`
	O float64 `json:"o"`
	H float64 `json:"h"`
	L float64 `json:"l"`
	C float64 `json:"c"`
	V int64   `json:"v"`
}

type alpacaTrade struct {
	T string  `json:"t"`
	P float64 `json:"p"`
	S int64   `json:"s"`
}

type alpacaQuote struct {
	T  string  `json:"t"`
	Bp float64 `json:"bp"`
	Ap float64 `json:"ap"`
}

// AlpacaSnapshot is the merged shape we return from both stock and
// crypto endpoints (their wire format differs slightly).
type AlpacaSnapshot struct {
	Symbol       string  // our internal form (BTC-USD not BTC/USD)
	Price        float64 // latest trade / last
	PrevClose    float64 // prev daily bar close
	DayHigh      float64
	DayLow       float64
	DayOpen      float64
	Volume       int64
	BidPrice     float64
	AskPrice     float64
	Timestamp    time.Time
}

// StockSnapshots fetches latestTrade + dailyBar + prevDailyBar for up to
// 100 equity symbols in one call. Symbols MUST be in plain US ticker form
// (no -USD suffix). Errors per-symbol are silent — only the network /
// auth-level error is returned.
func (c *AlpacaClient) StockSnapshots(ctx context.Context, symbols []string) ([]AlpacaSnapshot, error) {
	if len(symbols) == 0 {
		return nil, nil
	}
	u := fmt.Sprintf("%s/v2/stocks/snapshots?symbols=%s&feed=iex",
		alpacaDataHost, strings.Join(symbols, ","))
	var raw map[string]struct {
		LatestTrade  alpacaTrade `json:"latestTrade"`
		LatestQuote  alpacaQuote `json:"latestQuote"`
		DailyBar     alpacaBar   `json:"dailyBar"`
		PrevDailyBar alpacaBar   `json:"prevDailyBar"`
	}
	if err := c.doHost(ctx, http.MethodGet, u, nil, &raw); err != nil {
		return nil, err
	}
	out := make([]AlpacaSnapshot, 0, len(raw))
	for sym, snap := range raw {
		price := snap.LatestTrade.P
		if price == 0 {
			price = snap.DailyBar.C
		}
		ts, _ := time.Parse(time.RFC3339Nano, snap.LatestTrade.T)
		out = append(out, AlpacaSnapshot{
			Symbol:    strings.ToUpper(sym),
			Price:     price,
			PrevClose: snap.PrevDailyBar.C,
			DayHigh:   snap.DailyBar.H,
			DayLow:    snap.DailyBar.L,
			DayOpen:   snap.DailyBar.O,
			Volume:    snap.DailyBar.V,
			BidPrice:  snap.LatestQuote.Bp,
			AskPrice:  snap.LatestQuote.Ap,
			Timestamp: ts,
		})
	}
	return out, nil
}

// CryptoSnapshots is the crypto equivalent. Symbols must be in slash
// form (BTC/USD). Returned snapshots' Symbol field is converted back
// to our internal -USD form.
func (c *AlpacaClient) CryptoSnapshots(ctx context.Context, symbols []string) ([]AlpacaSnapshot, error) {
	if len(symbols) == 0 {
		return nil, nil
	}
	// URL-encode the slash so /v1beta3/.../snapshots?symbols=BTC%2FUSD works.
	encoded := make([]string, 0, len(symbols))
	for _, s := range symbols {
		encoded = append(encoded, strings.ReplaceAll(s, "/", "%2F"))
	}
	u := fmt.Sprintf("%s/v1beta3/crypto/us/snapshots?symbols=%s",
		alpacaDataHost, strings.Join(encoded, ","))
	var raw struct {
		Snapshots map[string]struct {
			LatestTrade  alpacaTrade `json:"latestTrade"`
			LatestQuote  alpacaQuote `json:"latestQuote"`
			DailyBar     alpacaBar   `json:"dailyBar"`
			PrevDailyBar alpacaBar   `json:"prevDailyBar"`
		} `json:"snapshots"`
	}
	if err := c.doHost(ctx, http.MethodGet, u, nil, &raw); err != nil {
		return nil, err
	}
	out := make([]AlpacaSnapshot, 0, len(raw.Snapshots))
	for sym, snap := range raw.Snapshots {
		price := snap.LatestTrade.P
		if price == 0 {
			price = snap.DailyBar.C
		}
		ts, _ := time.Parse(time.RFC3339Nano, snap.LatestTrade.T)
		out = append(out, AlpacaSnapshot{
			Symbol:    FromAlpacaSymbol(sym),
			Price:     price,
			PrevClose: snap.PrevDailyBar.C,
			DayHigh:   snap.DailyBar.H,
			DayLow:    snap.DailyBar.L,
			DayOpen:   snap.DailyBar.O,
			Volume:    snap.DailyBar.V,
			BidPrice:  snap.LatestQuote.Bp,
			AskPrice:  snap.LatestQuote.Ap,
			Timestamp: ts,
		})
	}
	return out, nil
}

// Snapshots takes a mixed list of internal symbols (BTC-USD + AAPL etc.),
// routes each to the right endpoint, and returns merged Quote-shaped
// snapshots. Failures on one side don't kill the other.
func (c *AlpacaClient) Snapshots(ctx context.Context, symbols []string) ([]AlpacaSnapshot, error) {
	var stocks, cryptos []string
	for _, s := range symbols {
		s = strings.ToUpper(strings.TrimSpace(s))
		if s == "" {
			continue
		}
		if strings.HasSuffix(s, "-USD") {
			cryptos = append(cryptos, AlpacaSymbol(s))
		} else {
			stocks = append(stocks, s)
		}
	}
	out := make([]AlpacaSnapshot, 0, len(symbols))
	if len(stocks) > 0 {
		s, err := c.StockSnapshots(ctx, stocks)
		if err == nil {
			out = append(out, s...)
		}
	}
	if len(cryptos) > 0 {
		s, err := c.CryptoSnapshots(ctx, cryptos)
		if err == nil {
			out = append(out, s...)
		}
	}
	return out, nil
}

// HistoricalBar is one OHLCV bar in our internal form (Alpaca crypto and
// equities are merged here so downstream UI code doesn't have to know).
type HistoricalBar struct {
	Time   time.Time `json:"time"`
	Open   float64   `json:"open"`
	High   float64   `json:"high"`
	Low    float64   `json:"low"`
	Close  float64   `json:"close"`
	Volume int64     `json:"volume"`
}

// StockBars fetches recent OHLCV bars for one equity. `timeframe` is an
// Alpaca timeframe string ("1Min", "5Min", "15Min", "1Hour", "1Day").
// We use the v2/stocks/{symbol}/bars endpoint with the IEX feed so it
// works on the free paper tier. `since` is the inclusive lower bound;
// pass a zero time to default to ~30 days ago for daily bars or ~5
// days ago for intraday.
func (c *AlpacaClient) StockBars(ctx context.Context, symbol, timeframe string, since time.Time, limit int) ([]HistoricalBar, error) {
	if limit <= 0 || limit > 10000 {
		limit = 1000
	}
	if since.IsZero() {
		// Defaults tuned for "1 day of intraday" / "30 days of daily".
		if strings.HasSuffix(timeframe, "Day") {
			since = time.Now().Add(-30 * 24 * time.Hour)
		} else {
			since = time.Now().Add(-5 * 24 * time.Hour)
		}
	}
	q := url.Values{}
	q.Set("timeframe", timeframe)
	q.Set("start", since.UTC().Format(time.RFC3339))
	q.Set("limit", strconv.Itoa(limit))
	q.Set("adjustment", "raw")
	q.Set("feed", "iex")
	u := fmt.Sprintf("%s/v2/stocks/%s/bars?%s",
		alpacaDataHost, url.PathEscape(symbol), q.Encode())
	var raw struct {
		Bars []alpacaBar `json:"bars"`
	}
	if err := c.doHost(ctx, http.MethodGet, u, nil, &raw); err != nil {
		return nil, err
	}
	return convertBars(raw.Bars), nil
}

// CryptoBars is the crypto equivalent. `symbol` is in slash form
// (BTC/USD). Free-tier crypto data has no feed restriction.
func (c *AlpacaClient) CryptoBars(ctx context.Context, symbol, timeframe string, since time.Time, limit int) ([]HistoricalBar, error) {
	if limit <= 0 || limit > 10000 {
		limit = 1000
	}
	if since.IsZero() {
		if strings.HasSuffix(timeframe, "Day") {
			since = time.Now().Add(-30 * 24 * time.Hour)
		} else {
			since = time.Now().Add(-5 * 24 * time.Hour)
		}
	}
	q := url.Values{}
	q.Set("symbols", symbol)
	q.Set("timeframe", timeframe)
	q.Set("start", since.UTC().Format(time.RFC3339))
	q.Set("limit", strconv.Itoa(limit))
	u := fmt.Sprintf("%s/v1beta3/crypto/us/bars?%s", alpacaDataHost, q.Encode())
	var raw struct {
		Bars map[string][]alpacaBar `json:"bars"`
	}
	if err := c.doHost(ctx, http.MethodGet, u, nil, &raw); err != nil {
		return nil, err
	}
	for _, bars := range raw.Bars {
		return convertBars(bars), nil
	}
	return nil, nil
}

// Bars dispatches to StockBars or CryptoBars based on the symbol form.
// Symbol is in our internal form ("AAPL" or "BTC-USD").
func (c *AlpacaClient) Bars(ctx context.Context, symbol, timeframe string, since time.Time, limit int) ([]HistoricalBar, error) {
	sym := strings.ToUpper(strings.TrimSpace(symbol))
	if strings.HasSuffix(sym, "-USD") {
		return c.CryptoBars(ctx, AlpacaSymbol(sym), timeframe, since, limit)
	}
	return c.StockBars(ctx, sym, timeframe, since, limit)
}

func convertBars(in []alpacaBar) []HistoricalBar {
	out := make([]HistoricalBar, 0, len(in))
	for _, b := range in {
		ts, _ := time.Parse(time.RFC3339Nano, b.T)
		out = append(out, HistoricalBar{
			Time: ts, Open: b.O, High: b.H, Low: b.L,
			Close: b.C, Volume: b.V,
		})
	}
	return out
}
