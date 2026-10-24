package api

import (
	"testing"
	"time"
)

func TestParseRange(t *testing.T) {
	const day = 24 * time.Hour
	for in, want := range map[string]time.Duration{"": day, "24h": day, "7d": 7 * day, "30d": 30 * day, "168h": 7 * day} {
		if got, ok := parseRange(in); !ok || got != want {
			t.Errorf("parseRange(%q) = %v, %v; want %v", in, got, ok, want)
		}
	}
	for _, bad := range []string{"d", "-1d", "0d", "xd", "1w", "-5h"} {
		if _, ok := parseRange(bad); ok {
			t.Errorf("parseRange(%q) accepted", bad)
		}
	}
}
