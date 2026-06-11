package trader

import (
	"context"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

// FetchNews returns the most recent headlines for each requested symbol
// (max `perSymbol` per symbol). Source is Yahoo Finance's public RSS feed:
//
//	https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL&region=US&lang=en-US
//
// Failures are soft — if Yahoo returns 404 / 401 / garbage we skip that
// symbol and keep going.
func FetchNews(ctx context.Context, symbols []string, perSymbol int) ([]NewsItem, error) {
	symbols = cleanSymbols(symbols)
	if perSymbol <= 0 {
		perSymbol = 3
	}
	out := []NewsItem{}
	for _, sym := range symbols {
		items, err := fetchSymbolNews(ctx, sym, perSymbol)
		if err != nil {
			continue
		}
		out = append(out, items...)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Published.After(out[j].Published)
	})
	return out, nil
}

// MacroFeed is one global / regional news source. We map the underlying
// Yahoo symbol to a friendly bucket label so the panel can see "this
// headline came from EUROPE" without seeing the cryptic ticker.
type MacroFeed struct {
	Symbol string // Yahoo symbol used for the RSS query
	Bucket string // friendly label shown in briefing (e.g. "EUROPE")
}

// MacroFeeds covers Europe, Asia, and US-macro headlines so the panel
// has a global picture, not just per-ticker headlines.
var MacroFeeds = []MacroFeed{
	{Symbol: "^GSPC", Bucket: "US-MACRO"},     // S&P 500
	{Symbol: "^IXIC", Bucket: "US-MACRO"},     // Nasdaq Composite
	{Symbol: "^FTSE", Bucket: "EUROPE"},       // FTSE 100 (UK)
	{Symbol: "^GDAXI", Bucket: "EUROPE"},      // DAX (Germany)
	{Symbol: "^STOXX50E", Bucket: "EUROPE"},   // Euro Stoxx 50
	{Symbol: "^N225", Bucket: "ASIA"},         // Nikkei 225 (Japan)
	{Symbol: "^HSI", Bucket: "ASIA"},          // Hang Seng (HK)
	{Symbol: "000001.SS", Bucket: "ASIA"},     // Shanghai Composite
}

// FetchMacroNews returns headlines from the global macro feeds, tagged
// with their region bucket as the Symbol field so the panel can group
// them under "EUROPE" / "ASIA" / "US-MACRO" instead of cryptic indices.
func FetchMacroNews(ctx context.Context, perFeed int) ([]NewsItem, error) {
	if perFeed <= 0 {
		perFeed = 2
	}
	out := []NewsItem{}
	for _, f := range MacroFeeds {
		items, err := fetchSymbolNews(ctx, f.Symbol, perFeed)
		if err != nil {
			continue
		}
		for i := range items {
			items[i].Symbol = f.Bucket // overwrite with friendly bucket
		}
		out = append(out, items...)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Published.After(out[j].Published)
	})
	return out, nil
}

func fetchSymbolNews(ctx context.Context, symbol string, max int) ([]NewsItem, error) {
	u := fmt.Sprintf(
		"https://feeds.finance.yahoo.com/rss/2.0/headline?s=%s&region=US&lang=en-US",
		url.QueryEscape(symbol),
	)
	req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")
	req.Header.Set("Accept", "application/rss+xml,application/xml,text/xml,*/*")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("yahoo news: %d", resp.StatusCode)
	}
	var feed struct {
		Channel struct {
			Item []struct {
				Title       string `xml:"title"`
				Link        string `xml:"link"`
				PubDate     string `xml:"pubDate"`
				Description string `xml:"description"`
				Source      string `xml:"source"`
			} `xml:"item"`
		} `xml:"channel"`
	}
	if err := xml.NewDecoder(resp.Body).Decode(&feed); err != nil {
		return nil, err
	}
	items := feed.Channel.Item
	if len(items) > max {
		items = items[:max]
	}
	out := make([]NewsItem, 0, len(items))
	for _, it := range items {
		t, _ := parseRSSDate(it.PubDate)
		out = append(out, NewsItem{
			Symbol:    strings.ToUpper(symbol),
			Title:     strings.TrimSpace(it.Title),
			Link:      strings.TrimSpace(it.Link),
			Source:    strings.TrimSpace(it.Source),
			Published: t,
			Summary:   stripHTML(it.Description),
		})
	}
	return out, nil
}

func parseRSSDate(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, fmt.Errorf("empty date")
	}
	formats := []string{
		time.RFC1123Z,
		time.RFC1123,
		"Mon, 02 Jan 2006 15:04:05 MST",
		time.RFC3339,
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unparsed date: %q", s)
}

func stripHTML(s string) string {
	out := strings.Builder{}
	inTag := false
	for _, r := range s {
		switch r {
		case '<':
			inTag = true
		case '>':
			inTag = false
		default:
			if !inTag {
				out.WriteRune(r)
			}
		}
	}
	cleaned := strings.TrimSpace(out.String())
	if len(cleaned) > 400 {
		cleaned = cleaned[:400] + "…"
	}
	return cleaned
}
