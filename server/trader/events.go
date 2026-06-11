package trader

import (
	"strings"
)

// detectBinaryEvents scans recent news for keywords that signal an
// imminent binary event (earnings release, FDA decision, guidance
// update). Returns a map symbol → matched keyword phrase. The team
// uses this to size DOWN ahead of binaries — Mira specifically.
//
// This is a proxy for a real earnings calendar; it picks up the event
// only when a headline mentions it, but for actively-discussed names
// that's almost always the case in the news flow.
var binaryKeywords = []string{
	"earnings report",
	"earnings results",
	"reports earnings",
	"reports q1", "reports q2", "reports q3", "reports q4",
	"q1 results", "q2 results", "q3 results", "q4 results",
	"quarterly results",
	"earnings beat", "earnings miss",
	"guidance cut", "guidance raised", "lowered guidance",
	"fda decision", "fda approval", "fda rejects",
	"clinical trial results", "phase 3 results", "phase iii results",
	"fed decision", "fomc",
	"ipo prices", "lockup expires",
}

func detectBinaryEvents(news []NewsItem) map[string]string {
	out := map[string]string{}
	for _, n := range news {
		low := strings.ToLower(n.Title + " " + n.Summary)
		for _, kw := range binaryKeywords {
			if strings.Contains(low, kw) {
				if existing, ok := out[n.Symbol]; ok {
					// Keep first match per symbol to avoid noise.
					_ = existing
				} else {
					out[n.Symbol] = kw
				}
				break
			}
		}
	}
	return out
}
