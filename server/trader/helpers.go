package trader

import (
	"regexp"
	"strings"
)

// applyWatchlistChangesLocked mutates m.state.Watchlist by removing
// `remove` and appending `add`, refusing to drop any symbol we hold a
// position in and capping the list at watchlistCap entries. Caller MUST
// hold m.mu.
func applyWatchlistChangesLocked(m *Manager, add, remove []string) {
	if len(add) == 0 && len(remove) == 0 {
		return
	}
	held := map[string]bool{}
	for _, p := range m.state.Positions {
		held[strings.ToUpper(p.Symbol)] = true
	}
	existing := map[string]bool{}
	for _, s := range m.state.Watchlist {
		existing[strings.ToUpper(s)] = true
	}
	removeSet := map[string]bool{}
	for _, s := range remove {
		s = strings.ToUpper(strings.TrimSpace(s))
		if s == "" || held[s] {
			continue
		}
		removeSet[s] = true
	}
	if len(removeSet) > 0 {
		next := m.state.Watchlist[:0]
		for _, s := range m.state.Watchlist {
			if removeSet[strings.ToUpper(s)] {
				continue
			}
			next = append(next, s)
		}
		m.state.Watchlist = append([]string(nil), next...)
	}
	const watchlistCap = 30
	for _, s := range add {
		s = strings.ToUpper(strings.TrimSpace(s))
		if s == "" || existing[s] || removeSet[s] {
			continue
		}
		if len(m.state.Watchlist) >= watchlistCap {
			break
		}
		m.state.Watchlist = append(m.state.Watchlist, s)
		existing[s] = true
	}
}

// collectBrokerRejections returns decisions whose Rejected reason came
// from the upstream broker (i.e. real submission failures), not local
// guards like "qty is zero" or "no quote". Those local rejections
// represent the team's own decision to skip and shouldn't trigger a
// re-meeting.
func collectBrokerRejections(decisions []Decision) []Decision {
	out := []Decision{}
	for _, d := range decisions {
		if d.Rejected == "" || d.Executed {
			continue
		}
		r := strings.ToLower(d.Rejected)
		// Skip purely local refusals.
		switch r {
		case "qty is zero", "no quote":
			continue
		}
		// "alpaca order: ..." or anything from the broker payload, plus
		// our own broker-side guards (cash reserve, not enough shares).
		if strings.Contains(r, "alpaca") ||
			strings.Contains(r, "wash trade") ||
			strings.Contains(r, "buying power") ||
			strings.Contains(r, "insufficient cash") ||
			strings.Contains(r, "not enough shares") ||
			strings.Contains(r, "requires a live broker") ||
			strings.Contains(r, "cannot short crypto") ||
			strings.Contains(r, "no open short") ||
			strings.Contains(r, "cover qty") ||
			strings.Contains(r, "would breach 10%% cash reserve") ||
			strings.Contains(r, "would breach 10% cash reserve") ||
			strings.Contains(r, "would breach 2%% cash reserve") ||
			strings.Contains(r, "would breach 2% cash reserve") ||
			strings.Contains(r, "still ") || // "still accepted (no fill yet)"
			strings.Contains(r, "rejected") ||
			strings.Contains(r, "canceled") ||
			strings.Contains(r, "cancelled") {
			out = append(out, d)
		}
	}
	return out
}

// tickerMentionRE finds standalone uppercase symbols in news text. We
// match 2-5 capital letters with an optional leading "$" so we catch
// both stylised tickers ("$NVDA") and unprefixed mentions in headlines
// ("Tesla's TSLA filing"). We post-filter against a stop list of common
// English words that look like tickers.
var tickerMentionRE = regexp.MustCompile(`\$?\b([A-Z]{2,5})\b`)

// commonWordTickers are uppercase English words that pattern-match as
// tickers but almost never refer to one in macro news. Skipping them
// kills the bulk of false positives without a real NLP pass.
var commonWordTickers = map[string]bool{
	"A": true, "I": true, "AI": true, "AN": true, "AS": true, "AT": true,
	"BE": true, "BY": true, "DO": true, "GO": true, "IF": true, "IN": true,
	"IS": true, "IT": true, "MY": true, "NO": true, "OF": true, "OK": true,
	"ON": true, "OR": true, "SO": true, "TO": true, "UP": true, "US": true,
	"WE": true, "ALL": true, "AND": true, "ANY": true, "ARE": true,
	"BUT": true, "CAN": true, "CEO": true, "CFO": true, "COO": true,
	"CTO": true, "DAY": true, "EOD": true, "EPS": true, "EST": true,
	"ETF": true, "EUR": true, "FED": true, "FOR": true, "FYI": true,
	"GBP": true, "GDP": true, "GET": true, "HAS": true, "HIS": true,
	"HOW": true, "IPO": true, "ITS": true, "JPY": true, "KPI": true,
	"LET": true, "LLC": true, "LOW": true, "MAY": true, "NEW": true,
	"NOT": true, "NOW": true, "OFF": true, "OLD": true, "ONE": true,
	"OPT": true, "OUR": true, "OUT": true, "OWN": true, "PER": true,
	"PRE": true, "PRO": true, "PUT": true, "REG": true, "ROI": true,
	"SEC": true, "SEE": true, "SET": true, "SVP": true, "TAX": true,
	"TBD": true, "THE": true, "TWO": true, "USD": true, "VIA": true,
	"WAS": true, "WAY": true, "WHO": true, "WHY": true, "YOU": true,
	"AFTER": true, "AGAIN": true, "BEFORE": true, "BELOW": true,
	"CHINA": true, "CHIEF": true, "DEAL": true, "DEALS": true,
	"EARLY": true, "EUROPE": true, "FED'S": true, "FIRST": true,
	"FROM": true, "GROUP": true, "HIGH": true, "HIGHS": true,
	"HOPES": true, "INDEX": true, "INTER": true, "JAPAN": true,
	"LARGE": true, "LATER": true, "LIVE": true, "LONG": true,
	"MORE": true, "NEAR": true, "NEXT": true, "NEWS": true,
	"OPEN": true, "OPENS": true, "OVER": true, "PARIS": true,
	"PLAN": true, "PLANS": true, "PRICE": true, "QUARTER": true,
	"RATES": true, "RECORD": true, "REPORT": true, "RISK": true,
	"SALES": true, "SHARES": true, "SHORT": true, "SOFT": true,
	"STOCK": true, "STOCKS": true, "STORY": true, "TARGET": true,
	"TAXES": true, "THIS": true, "TIME": true, "TOKYO": true,
	"TRADE": true, "TREND": true, "VOTE": true, "WALL": true,
	"WEEK": true, "WHEN": true, "WHILE": true, "WITH": true,
	"WORLD": true, "YEAR": true, "YEARS": true, "YIELD": true,
	"YIELDS": true, "ZONE": true,
	// Region tags we use internally as "symbols" for macro buckets.
	"ASIA": true,
}

// extractMentionedTickers scans the headlines + summaries for plausible
// ticker mentions and returns the ones that aren't already on the
// watchlist. Cap at 12 to keep the briefing readable.
func extractMentionedTickers(news []NewsItem, watchlist []string) []string {
	on := map[string]bool{}
	for _, s := range watchlist {
		on[strings.ToUpper(strings.TrimSpace(s))] = true
		// Also block the crypto base form so "BTC-USD" on the watchlist
		// silences a "BTC" mention.
		if strings.HasSuffix(strings.ToUpper(s), "-USD") {
			on[strings.TrimSuffix(strings.ToUpper(s), "-USD")] = true
		}
	}
	seen := map[string]int{}
	for _, n := range news {
		text := n.Title + " " + n.Summary
		matches := tickerMentionRE.FindAllStringSubmatch(text, -1)
		for _, m := range matches {
			t := strings.ToUpper(m[1])
			if commonWordTickers[t] || on[t] {
				continue
			}
			// Macro bucket labels like "US-MACRO" come through as
			// the news.Symbol field, not as title text — skip.
			if strings.HasSuffix(t, "MACRO") {
				continue
			}
			seen[t]++
		}
	}
	// Only surface tickers mentioned at least once; sort by frequency
	// then alphabetically.
	type sc struct {
		sym string
		n   int
	}
	picked := []sc{}
	for s, n := range seen {
		picked = append(picked, sc{s, n})
	}
	// Simple insertion sort — tiny n.
	for i := 1; i < len(picked); i++ {
		for j := i; j > 0; j-- {
			a, b := picked[j-1], picked[j]
			if a.n < b.n || (a.n == b.n && a.sym > b.sym) {
				picked[j-1], picked[j] = b, a
			} else {
				break
			}
		}
	}
	if len(picked) > 12 {
		picked = picked[:12]
	}
	out := make([]string, 0, len(picked))
	for _, p := range picked {
		out = append(out, p.sym)
	}
	return out
}
