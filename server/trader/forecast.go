package trader

import (
	"math"
	"time"
)

// ComputeForecast fits a simple linear-trend + volatility model to the
// recent price history and projects the symbol's price out to the
// requested horizon (in hours). The returned Forecast includes a
// smooth curve for the chart, plus named +5h / +10h snapshots.
//
// The model:
//   - linear regression of price vs time on the last `lookbackPoints`
//     samples gives slope (drift) and intercept,
//   - 1σ relative volatility is the stdev of log returns scaled to
//     per-√hour (random-walk assumption),
//   - confidence band at +Δt is ±1σ * √(Δt in hours) * basePrice,
//   - confidence score blends slope-vs-noise with sample size — strong
//     trends with low noise → confidence near 1.
//
// This is intentionally cheap and explainable. It's not a real
// forecasting model — it's an honest extrapolation we can put on a
// chart without lying to the user about its precision.
func ComputeForecast(symbol string, hist []PricePoint, horizonH float64, curvePoints int) Forecast {
	if horizonH <= 0 {
		horizonH = 10
	}
	if curvePoints < 2 {
		curvePoints = 12
	}
	now := time.Now()
	out := Forecast{
		Symbol:      symbol,
		GeneratedAt: now,
		HorizonH:    horizonH,
		Direction:   "flat",
	}
	// Trim to the most recent samples we want to fit on. Anything older
	// than ~6h tends to be a different regime.
	const lookbackPoints = 360 // ~1h at 10s cadence
	if n := len(hist); n > lookbackPoints {
		hist = hist[n-lookbackPoints:]
	}
	if len(hist) < 6 {
		return out // not enough data to forecast — caller should hide it
	}
	out.SampleSize = len(hist)

	// Use seconds-since-first-sample as the X axis so numbers stay
	// well-conditioned for the regression.
	t0 := hist[0].Time
	xs := make([]float64, len(hist))
	ys := make([]float64, len(hist))
	for i, p := range hist {
		xs[i] = p.Time.Sub(t0).Seconds()
		ys[i] = p.Price
	}
	slopePerSec, intercept := linearFit(xs, ys)
	// Convert slope to per-hour for human readability + downstream use.
	out.SlopePerH = slopePerSec * 3600.0

	// Residuals → 1σ relative volatility per √hour.
	// We use log-returns between consecutive samples so the result is
	// scale-invariant.
	var sumSq float64
	var nRet int
	for i := 1; i < len(hist); i++ {
		if hist[i-1].Price <= 0 || hist[i].Price <= 0 {
			continue
		}
		dt := hist[i].Time.Sub(hist[i-1].Time).Seconds()
		if dt <= 0 {
			continue
		}
		r := math.Log(hist[i].Price/hist[i-1].Price) / math.Sqrt(dt)
		sumSq += r * r
		nRet++
	}
	sigmaPerSqrtSec := 0.0
	if nRet > 1 {
		sigmaPerSqrtSec = math.Sqrt(sumSq / float64(nRet))
	}
	// Convert to "per √hour" (multiply by √3600).
	out.SigmaPct = sigmaPerSqrtSec * 60.0 // √3600 == 60

	last := hist[len(hist)-1]
	out.BasePrice = last.Price
	lastX := xs[len(xs)-1]

	// Build the smooth projection curve from "now" → +horizonH.
	out.Curve = make([]ForecastPoint, 0, curvePoints)
	stepH := horizonH / float64(curvePoints-1)
	for i := 0; i < curvePoints; i++ {
		dh := stepH * float64(i)
		x := lastX + dh*3600.0
		mid := slopePerSec*x + intercept
		// Floor mid at a small positive number so the band can't go
		// negative on volatile names with steep down trends.
		if mid < 0.01*last.Price {
			mid = 0.01 * last.Price
		}
		band := out.SigmaPct * math.Sqrt(dh) * last.Price
		out.Curve = append(out.Curve, ForecastPoint{
			Time:  now.Add(time.Duration(dh*3600.0) * time.Second),
			Price: mid,
			Lower: math.Max(0, mid-band),
			Upper: mid + band,
		})
	}
	// Named snapshots — if horizon is shorter than 5/10h we just use
	// what we have (capped at horizonH).
	out.Snap5h = forecastAt(slopePerSec, intercept, out.SigmaPct, last.Price, lastX, math.Min(5, horizonH), now)
	out.Snap10h = forecastAt(slopePerSec, intercept, out.SigmaPct, last.Price, lastX, math.Min(10, horizonH), now)

	// Direction & confidence.
	// Move = slope*horizon. Compare against horizon-scaled noise.
	move := out.SlopePerH * horizonH
	noise := out.SigmaPct * math.Sqrt(horizonH) * last.Price
	switch {
	case noise > 0 && move > 0.25*noise:
		out.Direction = "up"
	case noise > 0 && move < -0.25*noise:
		out.Direction = "down"
	default:
		out.Direction = "flat"
	}
	if noise > 0 {
		// signal-to-noise ratio capped at 2 → mapped to 0..1
		snr := math.Abs(move) / noise
		if snr > 2 {
			snr = 2
		}
		out.Confidence = snr / 2.0
	}
	return out
}

// forecastAt is a tiny helper that produces one ForecastPoint at a
// specific +Δh from the last sample, with the confidence band scaled
// by √Δh (random-walk).
func forecastAt(slopePerSec, intercept, sigmaPct, base, lastX, dh float64, now time.Time) ForecastPoint {
	x := lastX + dh*3600.0
	mid := slopePerSec*x + intercept
	if mid < 0.01*base {
		mid = 0.01 * base
	}
	band := sigmaPct * math.Sqrt(dh) * base
	return ForecastPoint{
		Time:  now.Add(time.Duration(dh*3600.0) * time.Second),
		Price: mid,
		Lower: math.Max(0, mid-band),
		Upper: mid + band,
	}
}

// linearFit returns the (slope, intercept) of an ordinary least-squares
// fit of ys to xs. Returns (0, mean(ys)) when xs has zero variance,
// which makes the rest of the model degenerate gracefully.
func linearFit(xs, ys []float64) (slope, intercept float64) {
	n := float64(len(xs))
	if n < 2 {
		if len(ys) > 0 {
			return 0, ys[0]
		}
		return 0, 0
	}
	var sx, sy, sxy, sxx float64
	for i := range xs {
		sx += xs[i]
		sy += ys[i]
		sxy += xs[i] * ys[i]
		sxx += xs[i] * xs[i]
	}
	denom := n*sxx - sx*sx
	if denom == 0 {
		return 0, sy / n
	}
	slope = (n*sxy - sx*sy) / denom
	intercept = (sy - slope*sx) / n
	return slope, intercept
}
