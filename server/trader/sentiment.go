package trader

import (
	"math"
	"regexp"
	"strings"
)

// Sentiment scoring is a tiny lexicon-based scorer tuned for financial
// headlines. We deliberately keep it local (no LLM cost) so it can run
// on every news refresh; the LLM panel sees the score baked into the
// briefing instead of having to assess polarity itself.
//
// Score ranges in [-1, +1]:
//   +1 = strongly bullish (beats, upgrades, surge, record)
//    0 = neutral / unclear
//   -1 = strongly bearish (misses, downgrades, fraud, layoffs)
//
// This is NOT a general-purpose sentiment classifier — it's tuned for
// market-relevant words and ignores standard polarity words that don't
// move markets ("happy", "sad").

var bullishWords = map[string]float64{
	"beat": 1.0, "beats": 1.0, "beating": 0.8, "topped": 0.9,
	"surge": 1.0, "surges": 1.0, "surged": 0.9, "soared": 1.0, "soars": 1.0,
	"jump": 0.7, "jumps": 0.7, "jumped": 0.7, "rally": 0.8, "rallies": 0.8, "rallied": 0.8,
	"upgrade": 0.9, "upgraded": 0.9, "upgrades": 0.9,
	"record": 0.7, "high": 0.4, "highs": 0.4, "outperform": 0.8, "buy": 0.5,
	"raise": 0.5, "raised": 0.5, "raises": 0.5, "boost": 0.6, "boosted": 0.6,
	"growth": 0.5, "expand": 0.4, "expands": 0.4, "expansion": 0.5,
	"approval": 0.7, "approved": 0.7, "wins": 0.6, "win": 0.5, "won": 0.5,
	"deal": 0.4, "acquisition": 0.5, "acquires": 0.5, "merger": 0.4,
	"breakthrough": 0.9, "milestone": 0.5, "launch": 0.4, "launched": 0.4, "launches": 0.4,
	"profitable": 0.7, "profit": 0.5, "profits": 0.5, "strong": 0.5,
	"bullish": 1.0, "optimistic": 0.6, "positive": 0.4, "optimism": 0.5,
	"breakout": 0.8, "momentum": 0.5, "outlook": 0.2,
	"dividend": 0.4, "buyback": 0.7, "buybacks": 0.7, "repurchase": 0.6,
	"partnership": 0.5, "collaboration": 0.4,
	"recovery": 0.5, "rebound": 0.7, "rebounds": 0.7, "rebounded": 0.7,
}

var bearishWords = map[string]float64{
	"miss": -1.0, "missed": -1.0, "misses": -1.0, "missing": -0.7,
	"plunge": -1.0, "plunged": -1.0, "plunges": -1.0, "tumble": -0.9, "tumbled": -0.9,
	"slump": -0.8, "slumped": -0.8, "slumps": -0.8, "slide": -0.5, "slides": -0.5,
	"drop": -0.5, "drops": -0.5, "dropped": -0.5, "fall": -0.5, "fell": -0.5, "falls": -0.5,
	"downgrade": -0.9, "downgraded": -0.9, "downgrades": -0.9,
	"loss": -0.7, "losses": -0.7, "losing": -0.6,
	"weak": -0.5, "weaker": -0.6, "weakness": -0.6,
	"low": -0.3, "lows": -0.3, "underperform": -0.8, "sell": -0.5,
	"cut": -0.5, "cuts": -0.5, "slash": -0.7, "slashed": -0.7, "slashes": -0.7,
	"lawsuit": -0.7, "fraud": -1.0, "investigation": -0.7, "probe": -0.6, "subpoena": -0.7,
	"layoffs": -0.8, "layoff": -0.8, "fired": -0.5, "resign": -0.6, "resigned": -0.6, "quit": -0.4,
	"recall": -0.7, "recalled": -0.7, "halt": -0.6, "halted": -0.6,
	"bankruptcy": -1.0, "bankrupt": -1.0, "default": -0.9, "defaults": -0.9,
	"warning": -0.6, "warns": -0.7, "warned": -0.7, "guidance": -0.2,
	"bearish": -1.0, "pessimistic": -0.6, "negative": -0.4,
	"crash": -1.0, "crashed": -1.0, "selloff": -0.8, "rout": -0.9,
	"concern": -0.4, "concerns": -0.4, "worry": -0.5, "worries": -0.5, "fears": -0.6,
	"decline": -0.5, "declined": -0.5, "declines": -0.5, "shrink": -0.5, "shrinks": -0.5,
	"delay": -0.5, "delayed": -0.5, "delays": -0.5, "postpone": -0.5, "postponed": -0.5,
	"missed earnings": -1.0, "below estimates": -0.8,
}

// negators flip the sign of the next sentiment-bearing word within a
// short window. "not a great quarter" → bearish, not bullish.
var negators = map[string]bool{
	"not": true, "no": true, "never": true, "without": true,
	"fails": true, "failed": true, "lacks": true, "lacking": true,
}

var amplifiers = map[string]float64{
	"strongly": 1.4, "sharply": 1.5, "massively": 1.6, "deeply": 1.3,
	"slightly": 0.6, "marginally": 0.5, "barely": 0.5, "modestly": 0.7,
}

var wordRe = regexp.MustCompile(`[a-zA-Z']+`)

// ScoreSentiment returns a polarity score in [-1, 1] for one piece of
// text. Pass the headline + summary concatenated. Empty / unscorable
// text returns 0.
func ScoreSentiment(text string) float64 {
	if text == "" {
		return 0
	}
	low := strings.ToLower(text)
	tokens := wordRe.FindAllString(low, -1)
	if len(tokens) == 0 {
		return 0
	}
	score := 0.0
	hits := 0
	// Window-of-3 negation/amplification lookback.
	prevAmp := 1.0
	prevNeg := false
	for i, w := range tokens {
		if amp, ok := amplifiers[w]; ok {
			prevAmp = amp
			continue
		}
		if negators[w] {
			prevNeg = true
			continue
		}
		var v float64
		if x, ok := bullishWords[w]; ok {
			v = x
		} else if x, ok := bearishWords[w]; ok {
			v = x
		} else {
			// Reset modifiers after ~3 tokens with no hit.
			if i%3 == 0 {
				prevAmp = 1.0
				prevNeg = false
			}
			continue
		}
		v *= prevAmp
		if prevNeg {
			v = -v
		}
		score += v
		hits++
		prevAmp = 1.0
		prevNeg = false
	}
	if hits == 0 {
		return 0
	}
	// Average across hits and clamp. Many strong hits saturate at ±1.
	avg := score / float64(hits)
	return math.Max(-1, math.Min(1, avg))
}

// AnnotateSentiment fills NewsItem.Sentiment for every item in place.
func AnnotateSentiment(items []NewsItem) {
	for i := range items {
		text := items[i].Title
		if items[i].Summary != "" {
			text += ". " + items[i].Summary
		}
		items[i].Sentiment = ScoreSentiment(text)
	}
}

// AggregateSentimentBySymbol returns mean sentiment per symbol and a
// "loudness" count (how many headlines were scored). Items with score
// near zero still bump loudness but don't move the mean much.
func AggregateSentimentBySymbol(items []NewsItem) map[string]struct {
	Mean  float64
	Count int
} {
	type acc struct {
		sum   float64
		count int
	}
	by := map[string]*acc{}
	for _, it := range items {
		a, ok := by[it.Symbol]
		if !ok {
			a = &acc{}
			by[it.Symbol] = a
		}
		a.sum += it.Sentiment
		a.count++
	}
	out := map[string]struct {
		Mean  float64
		Count int
	}{}
	for sym, a := range by {
		if a.count == 0 {
			continue
		}
		out[sym] = struct {
			Mean  float64
			Count int
		}{Mean: a.sum / float64(a.count), Count: a.count}
	}
	return out
}
