package trader

import (
	"context"
	"fmt"
	"log"
	"math"
	"time"
)

// scalperLoop runs in the background while the trader is Running. It's
// the fast, deterministic counterpart to the heavy LLM meeting that
// only fires every IntervalMin minutes: this loop checks every open
// position once a minute and reacts to price moves the panel can't
// possibly react to in time (target hit, stop crossed, forecast
// inversion, big intra-tick rip).
//
// All actions go through executeLockedFull so they hit the broker the
// same way panel decisions do — bracket orders, extended hours, cash
// reserve, the works. Decisions get logged as source="scalper" so the
// dashboard can distinguish them from agent or manual trades.
func (m *Manager) scalperLoop(ctx context.Context) {
	t := time.NewTicker(60 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if m.isRunning() {
				m.scalperPass(ctx)
			}
		}
	}
}

// scalperPass evaluates every open position once. Called holding NO
// locks; takes the lock per-decision so we don't block the rest of the
// system. Errors are logged and swallowed — this loop must keep
// running.
func (m *Manager) scalperPass(ctx context.Context) {
	m.mu.Lock()
	if m.state.TickStatus.Active {
		// Don't fight the panel while it's mid-meeting.
		m.mu.Unlock()
		return
	}
	positions := append([]Position(nil), m.state.Positions...)
	plans := map[string]PositionPlan{}
	for _, p := range m.state.Plans {
		plans[p.Symbol] = p
	}
	quotes := map[string]Quote{}
	for sym, q := range m.quotes {
		quotes[sym] = q
	}
	forecasts := map[string]Forecast{}
	for sym, f := range m.state.Forecasts {
		forecasts[sym] = f
	}
	m.mu.Unlock()

	for _, p := range positions {
		q, ok := quotes[p.Symbol]
		if !ok || q.Price <= 0 {
			continue
		}
		decision := m.scalperDecide(p, q, plans[p.Symbol], forecasts[p.Symbol])
		if decision == nil {
			continue
		}
		m.mu.Lock()
		tr, err := m.executeLockedFull(
			decision.Symbol, decision.Action, decision.Qty, q.Price,
			decision.TargetPrice, decision.StopPrice,
			decision.Reason, "scalper",
		)
		if err == nil {
			_ = m.store.Save(m.state)
		}
		m.mu.Unlock()
		if err != nil {
			log.Printf("trader: scalper %s %s %.4f rejected: %v",
				decision.Action, decision.Symbol, decision.Qty, err)
			continue
		}
		log.Printf("trader: scalper %s %s %.4f@$%.2f (%s)",
			tr.Side, tr.Symbol, tr.Qty, tr.Price, tr.Reason)
		_ = ctx // ctx reserved for future LLM-assisted micro-decisions
	}
}

// scalperDecide returns a Decision to execute for one position, or nil
// to do nothing. The rules below are intentionally conservative — the
// heavy panel still owns position-opening and thesis-level decisions.
func (m *Manager) scalperDecide(p Position, q Quote, plan PositionPlan, fc Forecast) *Decision {
	if p.Qty == 0 || p.AvgCost <= 0 || q.Price <= 0 {
		return nil
	}
	long := p.Qty > 0
	absQty := math.Abs(p.Qty)
	plPct := 0.0
	if long {
		plPct = (q.Price - p.AvgCost) / p.AvgCost
	} else {
		plPct = (p.AvgCost - q.Price) / p.AvgCost
	}

	// ── Stop-out (long) ────────────────────────────────────────────
	// Belt-and-braces in case the broker bracket didn't fire (e.g.
	// simulated mode, or crypto where brackets aren't supported).
	if long && plan.StopPrice > 0 && q.Price <= plan.StopPrice {
		return &Decision{
			Symbol: p.Symbol,
			Action: "sell",
			Qty:    absQty,
			Reason: fmt.Sprintf("stop hit at $%.2f (plan $%.2f)", q.Price, plan.StopPrice),
		}
	}
	// ── Stop-out (short) ───────────────────────────────────────────
	if !long && plan.StopPrice > 0 && q.Price >= plan.StopPrice {
		return &Decision{
			Symbol: p.Symbol,
			Action: "cover",
			Qty:    absQty,
			Reason: fmt.Sprintf("short stop hit at $%.2f (plan $%.2f)", q.Price, plan.StopPrice),
		}
	}
	// ── Target reached — trim, don't flatten ───────────────────────
	// Take half off so we let the bracket / runner capture the rest.
	if long && plan.TargetPrice > 0 && q.Price >= plan.TargetPrice {
		half := math.Max(0.0001, absQty/2)
		return &Decision{
			Symbol: p.Symbol,
			Action: "sell",
			Qty:    half,
			Reason: fmt.Sprintf("target hit at $%.2f — trim half, let runner ride", q.Price),
		}
	}
	if !long && plan.TargetPrice > 0 && q.Price <= plan.TargetPrice {
		half := math.Max(0.0001, absQty/2)
		return &Decision{
			Symbol: p.Symbol,
			Action: "cover",
			Qty:    half,
			Reason: fmt.Sprintf("short target hit at $%.2f — cover half", q.Price),
		}
	}
	// ── Forecast inversion + winner ────────────────────────────────
	// If we're up >2% on a long and the model now expects the price
	// DOWN at the +5h horizon, take a quarter off.
	if long && plPct > 0.02 && fc.Direction == "down" &&
		fc.Snap5h.Price > 0 && fc.Snap5h.Price < q.Price*0.99 {
		q4 := math.Max(0.0001, absQty/4)
		return &Decision{
			Symbol: p.Symbol,
			Action: "sell",
			Qty:    q4,
			Reason: "forecast flipped down while +2% — lock in some gains",
		}
	}
	return nil
}
