package ai

import (
	"testing"

	"github.com/acanturgut/home-server/config"
	"github.com/acanturgut/home-server/homedevices"
)

func TestPickNode(t *testing.T) {
	hi := []config.Node{{ID: "big", Tier: config.TierHighEnd}}
	lo := []config.Node{{ID: "small", Tier: config.TierLowEnd}}
	cases := []struct {
		name     string
		prefer   config.Tier
		hi, lo   []config.Node
		wantNode string
	}{
		{"prefers high", config.TierHighEnd, hi, lo, "big"},
		{"prefers low", config.TierLowEnd, hi, lo, "small"},
		{"falls back to other tier", config.TierLowEnd, hi, nil, "big"},
		{"nothing online", config.TierHighEnd, nil, nil, "local"},
	}
	for _, c := range cases {
		if got := pickNode(c.prefer, c.hi, c.lo, "test").Route; got != c.wantNode {
			t.Errorf("%s: got %q, want %q", c.name, got, c.wantNode)
		}
	}
}

func TestParseHomeIntent(t *testing.T) {
	cases := []struct {
		msg      string
		ok       bool
		verb     intentVerb
		devType  homedevices.DeviceType
		value    int
		hasValue bool
	}{
		{"turn off the lights", true, verbOff, homedevices.TypeLight, 0, false},
		{"Turn on all lights!", true, verbOn, homedevices.TypeLight, 0, false},
		{"dim the lamp to 20%", true, verbDim, homedevices.TypeLight, 20, true},
		{"close the blinds", true, verbClose, homedevices.TypeBlind, 0, false},
		{"what is the capital of France?", false, verbNone, "", 0, false},
		{"turn it off", false, verbNone, "", 0, false}, // no target: leave to the LLM
	}
	for _, c := range cases {
		got, ok := parseHomeIntent(c.msg)
		if ok != c.ok || got.Verb != c.verb || got.Type != c.devType || got.Value != c.value || got.HasValue != c.hasValue {
			t.Errorf("parseHomeIntent(%q) = %+v ok=%v", c.msg, got, ok)
		}
	}
}
