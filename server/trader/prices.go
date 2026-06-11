package trader

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// FetchQuotes returns one Quote per symbol from Yahoo Finance's
// unauthenticated `quote` endpoint. Yahoo flakes occasionally; we fall
// back to the per-symbol `chart` endpoint on failure so the LLM and UI
// still see a price.
//
// We MUST send a real-looking User-Agent or Yahoo returns 401.
func FetchQuotes(ctx context.Context, symbols []string) ([]Quote, error) {
	symbols = cleanSymbols(symbols)
	if len(symbols) == 0 {
		return nil, nil
	}
	out := make([]Quote, 0, len(symbols))
	batch, _ := fetchQuoteBatch(ctx, symbols)
	have := map[string]bool{}
	for _, q := range batch {
		have[strings.ToUpper(q.Symbol)] = true
		out = append(out, q)
	}
	for _, s := range symbols {
		if have[strings.ToUpper(s)] {
			continue
		}
		if q, err := fetchQuoteChart(ctx, s); err == nil {
			out = append(out, q)
		}
	}
	return out, nil
}

// fetchQuoteBatch hits v7/finance/quote which returns all symbols in one
// request. Often rate-limits or 401s on free egress so we treat any error
// as soft and fall through to the chart endpoint per-symbol.
func fetchQuoteBatch(ctx context.Context, symbols []string) ([]Quote, error) {
	u, _ := url.Parse("https://query1.finance.yahoo.com/v7/finance/quote")
	q := u.Query()
	q.Set("symbols", strings.Join(symbols, ","))
	u.RawQuery = q.Encode()

	body, err := httpGetJSON(ctx, u.String())
	if err != nil {
		return nil, err
	}
	var parsed struct {
		QuoteResponse struct {
			Result []struct {
				Symbol               string  `json:"symbol"`
				ShortName            string  `json:"shortName"`
				LongName             string  `json:"longName"`
				RegularMarketPrice   float64 `json:"regularMarketPrice"`
				RegularMarketChangePercent float64 `json:"regularMarketChangePercent"`
				RegularMarketPreviousClose float64 `json:"regularMarketPreviousClose"`
				RegularMarketDayHigh float64 `json:"regularMarketDayHigh"`
				RegularMarketDayLow  float64 `json:"regularMarketDayLow"`
				RegularMarketVolume  int64   `json:"regularMarketVolume"`
				Currency             string  `json:"currency"`
				MarketState          string  `json:"marketState"`
			} `json:"result"`
		} `json:"quoteResponse"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	now := time.Now()
	out := make([]Quote, 0, len(parsed.QuoteResponse.Result))
	for _, r := range parsed.QuoteResponse.Result {
		name := r.ShortName
		if name == "" {
			name = r.LongName
		}
		out = append(out, Quote{
			Symbol:      strings.ToUpper(r.Symbol),
			Name:        name,
			Price:       r.RegularMarketPrice,
			Currency:    r.Currency,
			PrevClose:   r.RegularMarketPreviousClose,
			ChangePct:   r.RegularMarketChangePercent,
			DayHigh:     r.RegularMarketDayHigh,
			DayLow:      r.RegularMarketDayLow,
			Volume:      r.RegularMarketVolume,
			MarketState: r.MarketState,
			FetchedAt:   now,
		})
	}
	return out, nil
}

// fetchQuoteChart asks v8/finance/chart for the latest 5m bar. This is
// reliable when v7 throws 401. We synthesise a Quote from the chart meta.
func fetchQuoteChart(ctx context.Context, symbol string) (Quote, error) {
	u := fmt.Sprintf(
		"https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=5m&range=1d",
		url.PathEscape(symbol),
	)
	body, err := httpGetJSON(ctx, u)
	if err != nil {
		return Quote{}, err
	}
	var parsed struct {
		Chart struct {
			Result []struct {
				Meta struct {
					Symbol             string  `json:"symbol"`
					RegularMarketPrice float64 `json:"regularMarketPrice"`
					ChartPreviousClose float64 `json:"chartPreviousClose"`
					PreviousClose      float64 `json:"previousClose"`
					Currency           string  `json:"currency"`
					ExchangeName       string  `json:"exchangeName"`
					InstrumentType     string  `json:"instrumentType"`
					ShortName          string  `json:"shortName"`
					LongName           string  `json:"longName"`
				} `json:"meta"`
			} `json:"result"`
			Error any `json:"error"`
		} `json:"chart"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return Quote{}, err
	}
	if len(parsed.Chart.Result) == 0 {
		return Quote{}, fmt.Errorf("yahoo: no chart for %s", symbol)
	}
	m := parsed.Chart.Result[0].Meta
	prev := m.PreviousClose
	if prev == 0 {
		prev = m.ChartPreviousClose
	}
	change := 0.0
	if prev > 0 {
		change = (m.RegularMarketPrice - prev) / prev * 100
	}
	name := m.ShortName
	if name == "" {
		name = m.LongName
	}
	return Quote{
		Symbol:    strings.ToUpper(m.Symbol),
		Name:      name,
		Price:     m.RegularMarketPrice,
		Currency:  m.Currency,
		PrevClose: prev,
		ChangePct: change,
		FetchedAt: time.Now(),
	}, nil
}

func httpGetJSON(ctx context.Context, u string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
	if err != nil {
		return nil, err
	}
	// Yahoo blocks the default Go user agent.
	req.Header.Set("User-Agent",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")
	req.Header.Set("Accept", "application/json,text/plain,*/*")
	client := &http.Client{Timeout: 12 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		io.Copy(io.Discard, resp.Body)
		return nil, fmt.Errorf("yahoo: %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func cleanSymbols(in []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.TrimSpace(strings.ToUpper(s))
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}
