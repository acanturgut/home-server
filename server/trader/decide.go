package trader

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/acanturgut/home-server/ai"
)

// DecisionInput is the snapshot the LLM panel sees on each tick.
type DecisionInput struct {
	Cash         float64
	Deposited    float64
	Withdrawn    float64
	Positions    []Position
	Quotes       []Quote
	News         []NewsItem
	Watchlist    []string
	Plans        []PositionPlan // open theses from previous ticks
	Memo         string         // running journal updated by the LLM each tick
	RecentTrades []Trade        // last N trades for short-term continuity
	Broker       *BrokerStatus  // optional: live broker snapshot (Alpaca)
	// Round is 1 for the initial meeting of a tick; 2+ for re-meetings
	// triggered by broker rejections that the team needs to revise.
	Round int
	// PriorRejections lists decisions from earlier rounds in THIS tick
	// that the broker refused (e.g. wash-trade, insufficient buying
	// power). Rendered as a banner so the team can revise.
	PriorRejections []Decision
	// MentionedTickers are symbols name-checked in the news this tick
	// that are NOT currently on the watchlist — candidates Sofia may
	// add via watchlist_add.
	MentionedTickers []string
	// Indicators map symbol → TA snapshot (RSI/MACD/VWAP/ATR/SMAs)
	// computed from Alpaca bars. Optional but recommended.
	Indicators map[string]Indicators
	// KellyHints map symbol → fractional-Kelly sizing recommendation
	// derived from the latest Forecast. Surfaced in the briefing.
	KellyHints map[string]KellyHint
	// Lessons is a short list of bullet-form learnings from the
	// post-mortem Coach — surfaced near the top of the briefing so the
	// team avoids repeating mistakes.
	Lessons []string
	// Tasks is the current project board (Aria's). Active tasks are
	// rendered into the briefing so each role knows what they owe.
	Tasks []Task
	// RoleOverrides is HR's calibration sheet — per-role coaching
	// notes (and optional temperature deltas) that the panel applies
	// when assembling each system prompt.
	RoleOverrides map[string][]RoleOverride
	// Performance is the snapshot HR (Hank) reads to decide what to
	// adjust. Computed from recent trades + plans.
	Performance *PerformanceSnapshot
	// OnTurn, when non-nil, is invoked synchronously after each panel
	// turn completes with the full conversation-so-far. The callback
	// MUST NOT block — it's used by the manager to stream the meeting
	// into TickStatus.Conversation for the dashboard.
	OnTurn func(turns []ConversationTurn) `json:"-"`
}

// PerformanceSnapshot is HR's compact per-tick review surface.
// It is intentionally lightweight so callers can gradually populate
// richer metrics without changing the panel API shape.
type PerformanceSnapshot struct {
	GeneratedAt time.Time `json:"generated_at"`
	// Decision-level execution quality.
	DecisionCount int `json:"decision_count,omitempty"`
	ExecutedCount int `json:"executed_count,omitempty"`
	RejectedCount int `json:"rejected_count,omitempty"`
	// Trade outcomes.
	WinCount    int     `json:"win_count,omitempty"`
	LossCount   int     `json:"loss_count,omitempty"`
	RealisedPL  float64 `json:"realised_pl,omitempty"`
	UnrealisedPL float64 `json:"unrealised_pl,omitempty"`
	// Human-readable notes for Hank/HR.
	Highlights []string `json:"highlights,omitempty"`
	Lowlights  []string `json:"lowlights,omitempty"`
}

// Decide runs the full multi-role panel discussion and returns the
// executor's parsed action plan plus the full transcript.
func Decide(ctx context.Context, router *ai.Router, in DecisionInput) (
	model, memo, summary string,
	decisions []Decision,
	watchAdd, watchRemove []string,
	conversation []ConversationTurn,
	err error,
) {
	model, conversation, executorOut, err := RunPanel(ctx, router, in)
	if err != nil {
		return model, "", "", nil, nil, nil, conversation, err
	}
	memo, summary, decisions, watchAdd, watchRemove, perr := parseDecisionPayload(executorOut)
	if perr != nil {
		return model, "", "", nil, nil, nil, conversation, perr
	}
	return model, memo, summary, decisions, watchAdd, watchRemove, conversation, nil
}

// ─── Executor JSON parser ─────────────────────────────────────────────────

var jsonBlockRE = regexp.MustCompile(`(?s)\{.*\}`)

func parseDecisionPayload(raw string) (string, string, []Decision, []string, []string, error) {
	clean := strings.TrimSpace(raw)
	clean = strings.TrimPrefix(clean, "```json")
	clean = strings.TrimPrefix(clean, "```")
	clean = strings.TrimSuffix(clean, "```")
	clean = strings.TrimSpace(clean)
	if !strings.HasPrefix(clean, "{") {
		if m := jsonBlockRE.FindString(clean); m != "" {
			clean = m
		}
	}
	var payload struct {
		Memo      string `json:"memo"`
		Summary   string `json:"summary"`
		Decisions []struct {
			Symbol      string  `json:"symbol"`
			Action      string  `json:"action"`
			Qty         float64 `json:"qty"`
			Reason      string  `json:"reason"`
			HorizonMin  int     `json:"horizon_min"`
			TargetPrice float64 `json:"target_price"`
			StopPrice   float64 `json:"stop_price"`
			Confidence  float64 `json:"confidence"`
			Risk        float64 `json:"risk"`
		} `json:"decisions"`
		WatchlistAdd    []string `json:"watchlist_add"`
		WatchlistRemove []string `json:"watchlist_remove"`
	}
	if err := json.Unmarshal([]byte(clean), &payload); err != nil {
		return "", "", nil, nil, nil, fmt.Errorf("decision JSON parse: %w (got: %s)", err, truncate(clean, 200))
	}
	out := make([]Decision, 0, len(payload.Decisions))
	for _, d := range payload.Decisions {
		action := strings.ToLower(strings.TrimSpace(d.Action))
		switch action {
		case "buy", "sell", "hold", "short", "cover", "add":
			// ok
		default:
			// Unknown actions become "hold" so we don't accidentally
			// fire something dangerous; the rejection log will say why.
			action = "hold"
		}
		out = append(out, Decision{
			Symbol:      strings.ToUpper(strings.TrimSpace(d.Symbol)),
			Action:      action,
			Qty:         d.Qty,
			Reason:      strings.TrimSpace(d.Reason),
			HorizonMin:  d.HorizonMin,
			TargetPrice: d.TargetPrice,
			StopPrice:   d.StopPrice,
			Confidence:  d.Confidence,
			Risk:        d.Risk,
		})
	}
	add := normalizeSymbols(payload.WatchlistAdd)
	rem := normalizeSymbols(payload.WatchlistRemove)
	return strings.TrimSpace(payload.Memo), strings.TrimSpace(payload.Summary), out, add, rem, nil
}

func normalizeSymbols(in []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.ToUpper(strings.TrimSpace(s))
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}

// ─── Shared briefing text used by every panellist ─────────────────────────

// buildBriefing produces the plain-text "meeting agenda" every panellist
// sees. Factored out so each per-role prompt can stay short.
func buildBriefing(in DecisionInput) string {
	var b strings.Builder
	now := time.Now()
	// US market context (Alpaca runs on Eastern). Equities cash session
	// is 09:30–16:00 ET Mon–Fri. We compute it explicitly so the panel
	// can greet the team appropriately.
	et, err := time.LoadLocation("America/New_York")
	if err != nil {
		et = time.UTC
	}
	nyt := now.In(et)
	wd := nyt.Weekday()
	isWeekend := wd == time.Saturday || wd == time.Sunday
	hm := nyt.Hour()*60 + nyt.Minute()
	session := "after-hours"
	switch {
	case isWeekend:
		session = "weekend (US equities closed; crypto only)"
	case hm < 4*60:
		session = "overnight (US equities closed)"
	case hm < 9*60+30:
		session = "pre-market"
	case hm < 16*60:
		session = "regular session (US equities OPEN)"
	case hm < 20*60:
		session = "after-hours"
	default:
		session = "overnight"
	}
	greeting := "Good evening"
	switch {
	case nyt.Hour() < 5:
		greeting = "Late-night check-in"
	case nyt.Hour() < 12:
		greeting = "Good morning"
	case nyt.Hour() < 17:
		greeting = "Good afternoon"
	}
	fmt.Fprintf(&b, "Now: %s ET (%s, %s) — %s, team.\n",
		nyt.Format("Mon Jan 2 15:04"), wd.String(), session, greeting)
	fmt.Fprintf(&b, "Markets: %s\n", briefingSessionLine(now))
	fmt.Fprintf(&b, "Cash: $%.2f  (deposited=$%.2f withdrawn=$%.2f)\n",
		in.Cash, in.Deposited, in.Withdrawn)
	equity := in.Cash
	priceBySym := map[string]float64{}
	for _, q := range in.Quotes {
		priceBySym[q.Symbol] = q.Price
	}
	for _, p := range in.Positions {
		last := priceBySym[p.Symbol]
		if last <= 0 {
			last = p.AvgCost
		}
		equity += last * p.Qty
	}
	cashPct := 0.0
	if equity > 0 {
		cashPct = in.Cash / equity * 100
	}
	fmt.Fprintf(&b, "Equity: $%.2f  (cash %.1f%% of equity — system enforces only a 2%% min reserve; Mason will push to deploy the rest)\n",
		equity, cashPct)
	if cashPct > 20 {
		fmt.Fprintf(&b,
			"💰 Idle cash: %.1f%% of equity (~$%.2f) is sitting unused. Mason will demand we put it to work.\n",
			cashPct, in.Cash)
	}
	if cashPct < 5 {
		b.WriteString("⚠️  Cash near floor (<5%). A new buy requires selling something first.\n")
	}
	fmt.Fprintf(&b, "Watchlist: %s\n\n", strings.Join(in.Watchlist, ", "))

	if in.Round > 1 {
		fmt.Fprintf(&b,
			"⚠️  ROUND %d \u2014 the broker rejected some of last round's orders. "+
				"You MUST revise: skip the rejected names, switch sides, "+
				"adjust size, or hold. Do NOT re-submit the exact same orders.\n",
			in.Round)
	}
	if len(in.PriorRejections) > 0 {
		b.WriteString("Rejections from earlier rounds this tick:\n")
		for _, d := range in.PriorRejections {
			fmt.Fprintf(&b,
				"  - %s %s qty=%.4f \u2014 broker said: %s\n",
				strings.ToUpper(d.Action), d.Symbol, d.Qty, d.Rejected)
		}
		b.WriteString("\n")
	}
	if len(in.MentionedTickers) > 0 {
		fmt.Fprintf(&b,
			"Mentioned in news (NOT on watchlist \u2014 Sofia, consider watchlist_add): %s\n\n",
			strings.Join(in.MentionedTickers, ", "))
	}

	if len(in.Lessons) > 0 {
		b.WriteString("📓 Lessons from prior closed trades (Coach):\n")
		for _, l := range in.Lessons {
			fmt.Fprintf(&b, "  • %s\n", l)
		}
		b.WriteString("\n")
	}

	if board := tasksBriefing(in.Tasks); board != "" {
		b.WriteString(board)
		b.WriteString("\n")
	}

	if in.Broker != nil && in.Broker.Name != "" {
		if in.Broker.Connected {
			// Show effective available cash (BuyingPower already deducts
			// cash committed to pending orders) so agents know the true
			// deployable amount rather than the gross cash balance.
			effectiveCash := in.Broker.BuyingPower
			if effectiveCash <= 0 {
				effectiveCash = in.Broker.Cash
			}
			fmt.Fprintf(&b,
				"Broker: LIVE on %s — cash=$%.2f effectiveCash=$%.2f equity=$%.2f buyingPower=$%.2f\n",
				in.Broker.Name, in.Broker.Cash, effectiveCash, in.Broker.Equity, in.Broker.BuyingPower)
			fmt.Fprintf(&b, "  (effectiveCash = cash minus capital already committed to pending buy orders)\n")
			if len(in.Broker.PendingOrders) > 0 {
				fmt.Fprintf(&b, "Pending orders (still working at the broker):\n")
				for _, o := range in.Broker.PendingOrders {
					age := ""
					if !o.SubmittedAt.IsZero() {
						age = fmt.Sprintf(" (submitted %s ago)", time.Since(o.SubmittedAt).Round(time.Second))
					}
					fmt.Fprintf(&b,
						"  - %s %s %.4f %s [%s]%s — filled %.4f\n",
						strings.ToUpper(o.Side), o.Symbol, o.Qty, o.Type, o.Status, age, o.FilledQty)
				}
			} else {
				b.WriteString("Pending orders: none.\n")
			}
			b.WriteString("\n")
		} else {
			errMsg := in.Broker.Error
			if errMsg == "" {
				errMsg = "disconnected"
			}
			fmt.Fprintf(&b, "Broker: %s (NOT connected — %s) — running simulated.\n\n",
				in.Broker.Name, errMsg)
		}
	} else {
		b.WriteString("Broker: none — running fully simulated.\n\n")
	}

	if strings.TrimSpace(in.Memo) != "" {
		fmt.Fprintf(&b, "Last tick's memo:\n  %s\n\n", in.Memo)
	} else {
		b.WriteString("Last tick's memo: (none — first tick)\n\n")
	}

	planBySym := map[string]PositionPlan{}
	for _, p := range in.Plans {
		planBySym[p.Symbol] = p
	}

	b.WriteString("Open positions:\n")
	if len(in.Positions) == 0 {
		b.WriteString("  (none — all cash)\n")
	} else {
		for _, p := range in.Positions {
			last := priceBySym[p.Symbol]
			if last <= 0 {
				last = p.AvgCost
			}
			plPct := 0.0
			if p.AvgCost > 0 {
				plPct = (last - p.AvgCost) / p.AvgCost * 100
			}
			locked := p.Qty - p.AvailableQty
			availNote := ""
			if p.AvailableQty > 0 && locked > 0.0001 {
				// Some qty is held by open bracket exit legs — agents MUST
				// NOT try to sell more than available_qty or Alpaca will
				// reject the order with "insufficient qty available".
				availNote = fmt.Sprintf(" ⚠️ available_qty=%.4f (%.4f locked in bracket orders — do NOT sell more than available_qty)", p.AvailableQty, locked)
			}
			fmt.Fprintf(&b,
				"  - %s: qty=%.4f avgCost=$%.2f last=$%.2f unrealised=%+.2f%%%s\n",
				p.Symbol, p.Qty, p.AvgCost, last, plPct, availNote)
			if plan, ok := planBySym[p.Symbol]; ok {
				held := time.Since(plan.OpenedAt).Round(time.Minute)
				fmt.Fprintf(&b,
					"      plan: target=$%.2f stop=$%.2f horizon=%dm conf=%.2f held=%s thesis=%q\n",
					plan.TargetPrice, plan.StopPrice, plan.HorizonMin, plan.Confidence, held, plan.Thesis)
			}
		}
	}

	if len(in.RecentTrades) > 0 {
		b.WriteString("\nRecent trades (last few):\n")
		for _, t := range in.RecentTrades {
			realised := ""
			if t.Side == "sell" {
				realised = fmt.Sprintf(" realised=$%+.2f", t.Realised)
			}
			fmt.Fprintf(&b, "  - %s %s %.4f@$%.2f%s reason=%q\n",
				t.Time.Format("01-02 15:04"), strings.ToUpper(t.Side), t.Qty, t.Price, realised, t.Reason)
		}
	}

	b.WriteString("\nQuotes (intraday):\n")
	for _, q := range in.Quotes {
		rangePos := ""
		if q.DayHigh > 0 && q.DayLow > 0 && q.DayHigh > q.DayLow {
			pct := (q.Price - q.DayLow) / (q.DayHigh - q.DayLow) * 100
			rangePos = fmt.Sprintf(" rangePos=%.0f%%", pct)
		}
		highLow := ""
		if q.DayHigh > 0 && q.DayLow > 0 {
			highLow = fmt.Sprintf(" dayHigh=$%.2f dayLow=$%.2f", q.DayHigh, q.DayLow)
		}
		fmt.Fprintf(&b,
			"  - %s: $%.2f prev=$%.2f chg=%+.2f%%%s%s state=%s\n",
			q.Symbol, q.Price, q.PrevClose, q.ChangePct, highLow, rangePos, q.MarketState)
	}

	if len(in.Indicators) > 0 {
		b.WriteString("\nTechnicals (1H bars, computed from broker data):\n")
		// Stable order = watchlist order so the panel always sees the
		// same layout. Symbols absent from the map are skipped.
		seen := map[string]bool{}
		emit := func(sym string) {
			if seen[sym] {
				return
			}
			seen[sym] = true
			if ind, ok := in.Indicators[sym]; ok && ind.Bars > 0 {
				fmt.Fprintf(&b, "  - %s\n", ind.Brief())
			}
		}
		for _, s := range in.Watchlist {
			emit(s)
		}
		for _, p := range in.Positions {
			emit(p.Symbol)
		}
	}

	if len(in.KellyHints) > 0 {
		// Order hints by watchlist first, then positions, so layout is
		// consistent with the Technicals block above it.
		ordered := make([]string, 0, len(in.KellyHints))
		seen := map[string]bool{}
		for _, s := range in.Watchlist {
			if _, ok := in.KellyHints[s]; ok && !seen[s] {
				ordered = append(ordered, s)
				seen[s] = true
			}
		}
		for _, p := range in.Positions {
			if _, ok := in.KellyHints[p.Symbol]; ok && !seen[p.Symbol] {
				ordered = append(ordered, p.Symbol)
				seen[p.Symbol] = true
			}
		}
		b.WriteString(briefKellyHints(ordered, in.KellyHints))
	}

	bySym := map[string][]NewsItem{}
	for _, n := range in.News {
		bySym[n.Symbol] = append(bySym[n.Symbol], n)
	}
	syms := make([]string, 0, len(bySym))
	for s := range bySym {
		syms = append(syms, s)
	}
	sort.Strings(syms)
	if len(syms) > 0 {
		// Earnings / binary-event proxy: flag any symbol whose news
		// mentions earnings, results, guidance, or FDA-style binary
		// events this tick. The team should size DOWN into binaries.
		binaryHits := detectBinaryEvents(in.News)
		if len(binaryHits) > 0 {
			b.WriteString("\n⚠️ Binary-event watch (earnings / FDA / guidance keywords found):\n")
			for _, sym := range syms {
				if hit, ok := binaryHits[sym]; ok {
					fmt.Fprintf(&b, "  - %s: %s — Mira will demand reduced size.\n", sym, hit)
				}
			}
		}
		// Per-symbol sentiment summary (local lexicon, computed from
		// headline+summary). Helps Raj/Mira quantify what's hot vs not
		// without re-reading every headline.
		agg := AggregateSentimentBySymbol(in.News)
		if len(agg) > 0 {
			b.WriteString("\nNews sentiment (lexicon-scored, -1..+1):\n")
			for _, s := range syms {
				a, ok := agg[s]
				if !ok || a.Count == 0 {
					continue
				}
				tag := "neutral"
				switch {
				case a.Mean >= 0.4:
					tag = "BULLISH"
				case a.Mean >= 0.15:
					tag = "bullish"
				case a.Mean <= -0.4:
					tag = "BEARISH"
				case a.Mean <= -0.15:
					tag = "bearish"
				}
				fmt.Fprintf(&b, "  - %s: %+.2f (%d headlines, %s)\n",
					s, a.Mean, a.Count, tag)
			}
		}
		b.WriteString("\nNews — NEW headlines this tick (already-discussed stories from prior meetings are filtered out; regions: US-MACRO / EUROPE / ASIA cover global flow):\n")
		for _, s := range syms {
			fmt.Fprintf(&b, "  %s:\n", s)
			for _, it := range bySym[s] {
				when := ""
				if !it.Published.IsZero() {
					when = it.Published.Format("Jan 02 15:04")
				}
				fmt.Fprintf(&b, "    - [%s] %s\n", when, it.Title)
			}
		}
	} else {
		b.WriteString("\nNews: no new headlines this tick (everything already discussed in recent meetings).\n")
	}
	return b.String()
}

// ─── helpers ──────────────────────────────────────────────────────────────

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// genID returns a sortable-ish unique id for trades/logs.
func genID(prefix string) string {
	return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
}
