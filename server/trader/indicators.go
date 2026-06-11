package trader

import (
	"fmt"
	"math"
	"strings"
)

// Indicators is a compact technical-analysis snapshot we compute per
// symbol and feed into the meeting briefing so Kenji / Raj have an
// objective baseline (vs flying purely on the LLM's vibes).
//
// All values are best-effort: NaN means we didn't have enough data.
type Indicators struct {
	Symbol   string
	Price    float64 // last close
	SMA20    float64
	SMA50    float64
	VWAP     float64 // session VWAP from the supplied bars
	RSI14    float64 // 0..100
	MACD     float64 // MACD line  (EMA12 − EMA26)
	MACDSig  float64 // signal     (EMA9 of MACD)
	MACDHist float64 // histogram  (MACD − signal)
	ATR14    float64 // average true range — vol in dollars
	ATRPct   float64 // ATR / price  — vol in %
	Trend    string  // "up" / "down" / "flat" — agreement between SMAs
	Momentum string  // "overbought" / "oversold" / "neutral"
	Bars     int     // sample size used
}

// ComputeIndicators turns a series of OHLCV bars into the snapshot
// above. Pass at least 50 bars for everything to be meaningful;
// shorter series just leave the longer-window fields at NaN.
func ComputeIndicators(symbol string, bars []HistoricalBar) Indicators {
	out := Indicators{Symbol: symbol, Bars: len(bars)}
	if len(bars) == 0 {
		return out
	}
	closes := make([]float64, len(bars))
	highs := make([]float64, len(bars))
	lows := make([]float64, len(bars))
	vols := make([]float64, len(bars))
	for i, b := range bars {
		closes[i] = b.Close
		highs[i] = b.High
		lows[i] = b.Low
		vols[i] = float64(b.Volume)
	}
	out.Price = closes[len(closes)-1]

	out.SMA20 = simpleMA(closes, 20)
	out.SMA50 = simpleMA(closes, 50)
	out.VWAP = sessionVWAP(highs, lows, closes, vols)
	out.RSI14 = rsi(closes, 14)
	out.MACD, out.MACDSig = macd(closes, 12, 26, 9)
	out.MACDHist = out.MACD - out.MACDSig
	out.ATR14 = atr(highs, lows, closes, 14)
	if out.Price > 0 {
		out.ATRPct = out.ATR14 / out.Price * 100
	}

	out.Trend = trendLabel(out.Price, out.SMA20, out.SMA50)
	out.Momentum = momentumLabel(out.RSI14)
	return out
}

// Brief renders Indicators as a single line for the LLM briefing.
// Example: "AAPL: $182.45 trend=up RSI=63 MACD=+0.42 ATR=1.8% VWAP=$181.10"
func (ind Indicators) Brief() string {
	if ind.Bars == 0 {
		return ""
	}
	parts := []string{fmt.Sprintf("%s $%.2f", ind.Symbol, ind.Price)}
	if !math.IsNaN(ind.SMA20) && ind.SMA20 > 0 {
		parts = append(parts, fmt.Sprintf("trend=%s", ind.Trend))
	}
	if !math.IsNaN(ind.RSI14) {
		parts = append(parts, fmt.Sprintf("RSI=%.0f %s", ind.RSI14, ind.Momentum))
	}
	if !math.IsNaN(ind.MACDHist) {
		sign := "+"
		if ind.MACDHist < 0 {
			sign = ""
		}
		parts = append(parts, fmt.Sprintf("MACDh=%s%.3f", sign, ind.MACDHist))
	}
	if !math.IsNaN(ind.ATRPct) && ind.ATRPct > 0 {
		parts = append(parts, fmt.Sprintf("ATR=%.1f%%", ind.ATRPct))
	}
	if !math.IsNaN(ind.VWAP) && ind.VWAP > 0 {
		side := "above"
		if ind.Price < ind.VWAP {
			side = "below"
		}
		parts = append(parts, fmt.Sprintf("%s VWAP $%.2f", side, ind.VWAP))
	}
	return strings.Join(parts, " ")
}

// ── primitives ─────────────────────────────────────────────────────────

func simpleMA(xs []float64, n int) float64 {
	if len(xs) < n || n <= 0 {
		return math.NaN()
	}
	sum := 0.0
	for _, v := range xs[len(xs)-n:] {
		sum += v
	}
	return sum / float64(n)
}

func ema(xs []float64, n int) []float64 {
	if n <= 0 || len(xs) == 0 {
		return nil
	}
	out := make([]float64, len(xs))
	k := 2.0 / float64(n+1)
	out[0] = xs[0]
	for i := 1; i < len(xs); i++ {
		out[i] = xs[i]*k + out[i-1]*(1-k)
	}
	return out
}

func rsi(xs []float64, n int) float64 {
	if len(xs) < n+1 {
		return math.NaN()
	}
	gains, losses := 0.0, 0.0
	// Seed with the first n changes.
	for i := len(xs) - n; i < len(xs); i++ {
		d := xs[i] - xs[i-1]
		if d > 0 {
			gains += d
		} else {
			losses -= d
		}
	}
	if losses == 0 {
		return 100
	}
	rs := (gains / float64(n)) / (losses / float64(n))
	return 100 - 100/(1+rs)
}

func macd(xs []float64, fast, slow, signal int) (float64, float64) {
	if len(xs) < slow+signal {
		return math.NaN(), math.NaN()
	}
	fastE := ema(xs, fast)
	slowE := ema(xs, slow)
	line := make([]float64, len(xs))
	for i := range xs {
		line[i] = fastE[i] - slowE[i]
	}
	sig := ema(line, signal)
	return line[len(line)-1], sig[len(sig)-1]
}

func atr(highs, lows, closes []float64, n int) float64 {
	if len(closes) < n+1 {
		return math.NaN()
	}
	trs := make([]float64, 0, len(closes)-1)
	for i := 1; i < len(closes); i++ {
		hl := highs[i] - lows[i]
		hc := math.Abs(highs[i] - closes[i-1])
		lc := math.Abs(lows[i] - closes[i-1])
		trs = append(trs, math.Max(hl, math.Max(hc, lc)))
	}
	if len(trs) < n {
		return math.NaN()
	}
	sum := 0.0
	for _, v := range trs[len(trs)-n:] {
		sum += v
	}
	return sum / float64(n)
}

// sessionVWAP is the volume-weighted average over the most recent
// "session" (last 24 bars if 1H bars, ~one trading day). We use
// typical-price ((H+L+C)/3) weighted by volume.
func sessionVWAP(highs, lows, closes, vols []float64) float64 {
	n := len(closes)
	if n == 0 {
		return math.NaN()
	}
	start := n - 24
	if start < 0 {
		start = 0
	}
	totVol := 0.0
	totPV := 0.0
	for i := start; i < n; i++ {
		tp := (highs[i] + lows[i] + closes[i]) / 3
		totPV += tp * vols[i]
		totVol += vols[i]
	}
	if totVol == 0 {
		return math.NaN()
	}
	return totPV / totVol
}

func trendLabel(price, sma20, sma50 float64) string {
	if math.IsNaN(sma20) || math.IsNaN(sma50) || sma20 == 0 || sma50 == 0 {
		return "?"
	}
	switch {
	case price > sma20 && sma20 > sma50:
		return "up"
	case price < sma20 && sma20 < sma50:
		return "down"
	default:
		return "flat"
	}
}

func momentumLabel(rsi float64) string {
	switch {
	case math.IsNaN(rsi):
		return ""
	case rsi >= 70:
		return "overbought"
	case rsi <= 30:
		return "oversold"
	default:
		return "neutral"
	}
}
