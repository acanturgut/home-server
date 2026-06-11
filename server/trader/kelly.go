package trader

import (
	"fmt"
	"math"
)

// KellyHint is a per-symbol sizing recommendation we feed into the
// briefing. It's NOT a hard constraint — Mason and Kenji still own the
// final number — but it gives them a grounded starting point instead
// of pure vibes.
//
// We compute fractional Kelly using:
//   edge     = expected % return at the 5h horizon (from Forecast)
//   variance = 1σ % move at the 5h horizon (from Forecast)
//   kelly    = edge / variance^2     (clamped to [0, 0.5])
//   half     = kelly * 0.5           ← half-Kelly is the conventional
//                                       defensive default
//
// We then show this as a percent of equity, banded so the panel can
// pick "20-30%" rather than agonising over 24.6%.
type KellyHint struct {
	Symbol     string
	Edge       float64 // fractional expected return (e.g. 0.012 = +1.2%)
	Sigma      float64 // fractional 1σ (e.g. 0.018 = 1.8%)
	Fraction   float64 // half-Kelly fraction of equity in [0, 0.4]
	Confidence float64
	Note       string  // "skip" | "probe" | "core" | "max" ...
}

// computeKellyHints derives a sizing hint per watchlist / position
// symbol using the most recent Forecast snapshot. Returns a map even
// if some symbols have insufficient data — entries are simply omitted.
func (m *Manager) computeKellyHints(symbols []string) map[string]KellyHint {
	m.mu.Lock()
	forecasts := make(map[string]Forecast, len(m.state.Forecasts))
	for k, v := range m.state.Forecasts {
		forecasts[k] = v
	}
	m.mu.Unlock()

	out := map[string]KellyHint{}
	for _, sym := range symbols {
		fc, ok := forecasts[sym]
		if !ok || fc.BasePrice <= 0 || fc.Snap5h.Price <= 0 {
			continue
		}
		edge := (fc.Snap5h.Price - fc.BasePrice) / fc.BasePrice
		// SigmaPct in Forecast is per √h, so at 5h: σ * √5
		sigma := fc.SigmaPct * math.Sqrt(5)
		if sigma <= 0 {
			continue
		}
		// Kelly fraction. Take absolute value for the size — the panel
		// decides long vs short from edge sign separately.
		kelly := math.Abs(edge) / (sigma * sigma)
		// Apply confidence as a multiplier (low-confidence forecasts
		// get smaller bets) and use half-Kelly as the default.
		conf := fc.Confidence
		if conf < 0.05 {
			conf = 0.05
		}
		frac := math.Min(0.4, kelly*0.5*conf)
		note := ""
		switch {
		case frac < 0.02:
			note = "skip — edge too thin"
		case frac < 0.05:
			note = "probe"
		case frac < 0.15:
			note = "medium"
		case frac < 0.25:
			note = "core"
		default:
			note = "max — biggest conviction"
		}
		out[sym] = KellyHint{
			Symbol:     sym,
			Edge:       edge,
			Sigma:      sigma,
			Fraction:   frac,
			Confidence: fc.Confidence,
			Note:       note,
		}
	}
	return out
}

// briefKellyHints renders the hints as a compact briefing block.
// Example:
//   NVDA: edge=+1.8% σ=2.0% → half-Kelly 22% (core)
func briefKellyHints(symbols []string, hints map[string]KellyHint) string {
	if len(hints) == 0 {
		return ""
	}
	out := "\nSizing hints (half-Kelly from forecast — Mason/Kenji may override):\n"
	for _, sym := range symbols {
		h, ok := hints[sym]
		if !ok {
			continue
		}
		sign := "+"
		if h.Edge < 0 {
			sign = ""
		}
		out += fmt.Sprintf(
			"  - %s: edge=%s%.2f%% σ=%.2f%% → %.0f%% of equity (%s)\n",
			sym,
			sign, h.Edge*100,
			h.Sigma*100,
			h.Fraction*100,
			h.Note,
		)
	}
	return out
}
