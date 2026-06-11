package trader

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/acanturgut/home-server/ai"
)

// computeAllIndicators returns indicator snapshots for the union of the
// watchlist and current positions. It uses the on-disk Alpaca bar cache
// (Manager.Bars) so we don't hammer the broker every tick. Anything
// without enough bars is silently omitted.
func (m *Manager) computeAllIndicators(ctx context.Context, watchlist []string, positions []Position) map[string]Indicators {
	if m.alpaca == nil {
		return nil
	}
	syms := map[string]bool{}
	for _, s := range watchlist {
		syms[strings.ToUpper(s)] = true
	}
	for _, p := range positions {
		syms[strings.ToUpper(p.Symbol)] = true
	}
	out := make(map[string]Indicators, len(syms))
	for sym := range syms {
		// Best-effort: short per-symbol timeout so a slow symbol can't
		// stall the whole briefing build.
		c, cancel := context.WithTimeout(ctx, 4*time.Second)
		bars, err := m.Bars(c, sym, "1Hour")
		cancel()
		if err != nil || len(bars) < 15 {
			continue
		}
		out[sym] = ComputeIndicators(sym, bars)
	}
	return out
}

// recentLessons returns up to n most recent Coach lessons.
func (m *Manager) recentLessons(n int) []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	ls := m.state.Lessons
	if len(ls) == 0 {
		return nil
	}
	out := make([]string, 0, n)
	for i := 0; i < len(ls) && i < n; i++ {
		l := ls[i]
		sign := "+"
		if l.RealisedPL < 0 {
			sign = ""
		}
		out = append(out, fmt.Sprintf("[%s %s$%.2f] %s", l.Symbol, sign, l.RealisedPL, l.Text))
	}
	return out
}

// appendLessonLocked stores a new lesson, newest first, capped at 50.
// Caller must hold m.mu.
func (m *Manager) appendLessonLocked(l Lesson) {
	m.state.Lessons = append([]Lesson{l}, m.state.Lessons...)
	if len(m.state.Lessons) > 50 {
		m.state.Lessons = m.state.Lessons[:50]
	}
}

// runCoach inspects the trades from the most recent tick for closed
// round-trips (a sell or cover that took position qty to zero) and asks
// the heavy LLM for a 1-2 sentence post-mortem per close. The result is
// appended to State.Lessons so future briefings see them.
//
// Best-effort: any LLM error is logged and swallowed — Coach failures
// must never break the trading loop.
func (m *Manager) runCoach(ctx context.Context, recentTrades []Trade) {
	if m.router == nil || len(recentTrades) == 0 {
		return
	}
	// A trade closes a position when, after applying it, our state holds
	// 0 (or near-zero) of that symbol. We use the post-tick state as the
	// "after" because trades just got applied.
	m.mu.Lock()
	heldNow := map[string]float64{}
	for _, p := range m.state.Positions {
		heldNow[p.Symbol] = p.Qty
	}
	m.mu.Unlock()

	type closed struct {
		Symbol     string
		ExitTrade  Trade
		Entries    []Trade
		RealisedPL float64
		HoldMin    int
	}
	closes := []closed{}
	for _, t := range recentTrades {
		side := strings.ToLower(t.Side)
		if side != "sell" && side != "cover" {
			continue
		}
		// Position must be flat now to count as a "close" (vs partial
		// trim, which we don't post-mortem — too noisy).
		if abs(heldNow[t.Symbol]) > 0.0001 {
			continue
		}
		c := closed{Symbol: t.Symbol, ExitTrade: t, RealisedPL: t.Realised}
		// Gather all trades for this symbol in the recent window as
		// entries — keeps the LLM context concrete.
		earliest := t.Time
		for _, e := range recentTrades {
			if e.Symbol == t.Symbol && e.ID != t.ID {
				c.Entries = append(c.Entries, e)
				if e.Time.Before(earliest) {
					earliest = e.Time
				}
			}
		}
		c.HoldMin = int(t.Time.Sub(earliest).Minutes())
		closes = append(closes, c)
		if len(closes) >= 3 {
			break // cap LLM calls per tick
		}
	}
	if len(closes) == 0 {
		return
	}

	for _, c := range closes {
		text, err := m.askCoach(ctx, c.Symbol, c.RealisedPL, c.HoldMin, c.ExitTrade, c.Entries)
		if err != nil || strings.TrimSpace(text) == "" {
			continue
		}
		m.mu.Lock()
		m.appendLessonLocked(Lesson{
			Time:       time.Now(),
			Symbol:     c.Symbol,
			RealisedPL: c.RealisedPL,
			HoldMin:    c.HoldMin,
			Text:       strings.TrimSpace(text),
		})
		_ = m.store.Save(m.state)
		m.mu.Unlock()
	}
}

func (m *Manager) askCoach(ctx context.Context, symbol string, pl float64, holdMin int, exit Trade, entries []Trade) (string, error) {
	var b strings.Builder
	fmt.Fprintf(&b, "Closed trade post-mortem.\n")
	fmt.Fprintf(&b, "Symbol: %s\n", symbol)
	fmt.Fprintf(&b, "Realised P/L: $%.2f over %d minutes.\n", pl, holdMin)
	fmt.Fprintf(&b, "Exit: %s %.4f @ $%.2f (reason: %q)\n",
		strings.ToUpper(exit.Side), exit.Qty, exit.Price, exit.Reason)
	if len(entries) > 0 {
		b.WriteString("Entries:\n")
		for _, e := range entries {
			fmt.Fprintf(&b, "  - %s %.4f @ $%.2f (%s)\n",
				strings.ToUpper(e.Side), e.Qty, e.Price, e.Reason)
		}
	}

	system := "You are Coach, a calm post-trade analyst. Given a just-closed " +
		"round-trip, write ONE sentence (max 25 words) explaining the most " +
		"useful lesson the team should remember for next time. No greetings, " +
		"no preamble, no markdown — just the lesson. Focus on entry timing, " +
		"sizing, or thesis quality. If the trade was clean, say so briefly."

	msgs := []ai.Message{
		{Role: "system", Content: system},
		{Role: "user", Content: b.String()},
	}
	temp := float64(0.4)
	heavyID, _, hasHeavy := m.router.ResolveRoute(ctx, "heavy")
	var resp *ai.ChatResponse
	var err error
	if hasHeavy {
		resp, err = m.router.ChatOnNode(ctx, heavyID, msgs, &temp)
	} else {
		resp, err = m.router.Chat(ctx, "", msgs)
	}
	if err != nil || resp == nil {
		return "", err
	}
	return resp.Message.Content, nil
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}
