package ai

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/acanturgut/home-server/homedevices"
)

// HomeController is the minimum surface ai.Router needs to control devices.
// homedevices.Manager satisfies it; tests use a fake.
type HomeController interface {
	Devices() []homedevices.Device
	Apply(ctx context.Context, deviceID string, a homedevices.Action) error
}

// applyResult is a small named type so we can pass it across helpers.
type applyResult struct {
	dev homedevices.Device
	err error
}

// intentVerb is the action the user wants to take.
type intentVerb int

const (
	verbNone intentVerb = iota
	verbOn
	verbOff
	verbToggle
	verbBrightness // requires Value
	verbDim        // dim relative
	verbBrighten   // brighten relative
	verbOpen       // blinds: position 0
	verbClose      // blinds: position 100
	verbStatus     // "are the lights on?" — read-only
)

// homeIntent is the parsed user intent.
type homeIntent struct {
	Verb     intentVerb
	Value    int // brightness 0..100 OR position 0..100 (when applicable)
	HasValue bool
	Type     homedevices.DeviceType // optional filter ("lights", "plugs", "blinds")
	HasType  bool
	All      bool   // "all lights" / "all the lights"
	Raw      string // normalized message
}

// tryHandleHomeIntent returns true when the message was understood AND
// fully handled. When returning false the caller must continue with
// normal LLM handling.
func tryHandleHomeIntent(ctx context.Context, ctrl HomeController, msg string, emit func(StreamEvent)) bool {
	intent, ok := parseHomeIntent(msg)
	if !ok {
		return false
	}

	devices := ctrl.Devices()
	targets := selectTargets(intent, devices)
	if len(targets) == 0 {
		// We confidently parsed an intent but couldn't find any device to
		// act on. Better to tell the user directly than guess via LLM.
		emit(StreamEvent{Step: "classified", Tier: "tool", Route: "home", Reason: "home device control"})
		emit(StreamEvent{Step: "generating", Tier: "tool"})
		emit(StreamEvent{
			Step:    "done",
			Content: noDeviceFoundMessage(intent),
			Tier:    "tool",
		})
		return true
	}

	// Read-only "status" requests just describe state.
	if intent.Verb == verbStatus {
		emit(StreamEvent{Step: "classified", Tier: "tool", Route: "home", Reason: "home device status"})
		emit(StreamEvent{Step: "generating", Tier: "tool"})
		emit(StreamEvent{
			Step:    "done",
			Content: describeDevices(targets),
			Tier:    "tool",
		})
		return true
	}

	emit(StreamEvent{
		Step:   "classified",
		Tier:   "tool",
		Route:  "home",
		Reason: fmt.Sprintf("home control · %d device(s)", len(targets)),
	})
	emit(StreamEvent{Step: "generating", Tier: "tool", Message: "Sending command to your home…"})

	start := time.Now()
	results := make([]applyResult, 0, len(targets))
	for _, d := range targets {
		action := intentToAction(intent)
		err := ctrl.Apply(ctx, d.ID, action)
		results = append(results, applyResult{dev: d, err: err})
	}
	latency := time.Since(start)

	emit(StreamEvent{
		Step:    "done",
		Content: summarizeResults(intent, results),
		Tier:    "tool",
		Latency: latency.String(),
	})
	return true
}

// ---- intent parsing ---------------------------------------------------

var (
	reMultiSpace = regexp.MustCompile(`\s+`)
	rePunct      = regexp.MustCompile(`[?.!,;:]+$`)
	rePercent    = regexp.MustCompile(`(\d{1,3})\s*(?:%|percent)`)
	reTo         = regexp.MustCompile(`\bto\s+(\d{1,3})\b`)
)

func parseHomeIntent(raw string) (homeIntent, bool) {
	msg := strings.ToLower(strings.TrimSpace(raw))
	msg = rePunct.ReplaceAllString(msg, "")
	msg = reMultiSpace.ReplaceAllString(msg, " ")
	if msg == "" {
		return homeIntent{}, false
	}
	intent := homeIntent{Raw: msg}

	// Verb detection — order matters (more specific first).
	switch {
	case containsAny(msg, "dim ", "lower brightness", "make it dimmer", "darker"):
		intent.Verb = verbDim
	case containsAny(msg, "brighten", "make it brighter", "brighter"):
		intent.Verb = verbBrighten
	case containsAny(msg, "set brightness", "set the brightness", "brightness to"):
		intent.Verb = verbBrightness
	case containsAny(msg, "open the blinds", "open blinds", "raise blinds", "raise the blinds"):
		intent.Verb = verbOpen
		intent.Type = homedevices.TypeBlind
		intent.HasType = true
	case containsAny(msg, "close the blinds", "close blinds", "lower the blinds", "lower blinds"):
		intent.Verb = verbClose
		intent.Type = homedevices.TypeBlind
		intent.HasType = true
	case containsAny(msg, "turn off", "turn the", "switch off", "shut off", "lights off", "off the"):
		intent.Verb = verbOff
	case containsAny(msg, "turn on", "switch on", "lights on", "on the"):
		intent.Verb = verbOn
	case containsAny(msg, "toggle"):
		intent.Verb = verbToggle
	case startsWithAny(msg, "are the ", "is the ", "what is the state of") || containsAny(msg, "are my lights", "is my light"):
		intent.Verb = verbStatus
	}

	// Disambiguate "turn the X off|on": pattern handled by Verb above when
	// "turn off" or "off the" is present, but a bare "turn the lights" would
	// fall through. Detect trailing on/off.
	if intent.Verb == verbNone {
		if strings.HasSuffix(msg, " on") {
			intent.Verb = verbOn
		} else if strings.HasSuffix(msg, " off") {
			intent.Verb = verbOff
		}
	}

	if intent.Verb == verbNone {
		return homeIntent{}, false
	}

	// Brightness / position number extraction.
	if m := rePercent.FindStringSubmatch(msg); len(m) == 2 {
		intent.Value = clamp(parseInt(m[1]), 0, 100)
		intent.HasValue = true
	} else if m := reTo.FindStringSubmatch(msg); len(m) == 2 {
		intent.Value = clamp(parseInt(m[1]), 0, 100)
		intent.HasValue = true
	}

	// Type filter.
	if !intent.HasType {
		switch {
		case containsAny(msg, "lights", "light", "lamps", "lamp"):
			intent.Type = homedevices.TypeLight
			intent.HasType = true
		case containsAny(msg, "plugs", "plug", "outlet", "outlets", "switch"):
			intent.Type = homedevices.TypePlug
			intent.HasType = true
		case containsAny(msg, "blinds", "shades", "curtains"):
			intent.Type = homedevices.TypeBlind
			intent.HasType = true
		case containsAny(msg, " tv", "television"):
			intent.Type = homedevices.TypeTV
			intent.HasType = true
		case containsAny(msg, "speaker", "speakers"):
			intent.Type = homedevices.TypeSpeaker
			intent.HasType = true
		}
	}

	// "all the lights" / "everything" semantics.
	if containsAny(msg, "all the lights", "all lights", "every light") {
		intent.All = true
	}
	if containsAny(msg, "everything", "all devices", "all of them") {
		intent.All = true
	}

	// Heuristic safety: if there's no type, no room, no name, and no "all",
	// we don't have enough confidence to act. Fall through to LLM.
	if !intent.HasType && !intent.All {
		return homeIntent{}, false
	}

	return intent, true
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

func startsWithAny(s string, prefs ...string) bool {
	for _, p := range prefs {
		if strings.HasPrefix(s, p) {
			return true
		}
	}
	return false
}

func parseInt(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			break
		}
		n = n*10 + int(c-'0')
	}
	return n
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// selectTargets resolves the intent against the live device list.
// Strategy:
//  1. Filter to controllable devices of the matching type (when given).
//  2. If a room hint exists in the message, narrow to that room.
//  3. If a name substring exists, narrow further.
//  4. Always exclude hidden + unreachable devices.
func selectTargets(intent homeIntent, devices []homedevices.Device) []homedevices.Device {
	// Build list of room names present so we can sniff one out of the message.
	roomSet := map[string]bool{}
	for _, d := range devices {
		if d.Room != "" {
			roomSet[strings.ToLower(strings.TrimSpace(d.Room))] = true
		}
	}
	matchedRoom := ""
	// Longer room names first so "living room" beats "room".
	rooms := make([]string, 0, len(roomSet))
	for r := range roomSet {
		rooms = append(rooms, r)
	}
	sort.Slice(rooms, func(i, j int) bool { return len(rooms[i]) > len(rooms[j]) })
	for _, r := range rooms {
		if strings.Contains(intent.Raw, r) {
			matchedRoom = r
			break
		}
	}

	out := make([]homedevices.Device, 0, len(devices))
	for _, d := range devices {
		if d.Hidden {
			continue
		}
		if intent.HasType && d.Type != intent.Type {
			continue
		}
		if intent.Verb != verbStatus && !d.Reachable {
			continue
		}
		// Room filter (when hinted in message).
		if matchedRoom != "" && strings.ToLower(strings.TrimSpace(d.Room)) != matchedRoom {
			continue
		}
		out = append(out, d)
	}
	return out
}

func intentToAction(intent homeIntent) homedevices.Action {
	switch intent.Verb {
	case verbOn:
		return homedevices.Action{Action: "on"}
	case verbOff:
		return homedevices.Action{Action: "off"}
	case verbToggle:
		return homedevices.Action{Action: "toggle"}
	case verbBrightness:
		v := intent.Value
		if !intent.HasValue {
			v = 60
		}
		return homedevices.Action{Action: "brightness", Brightness: &v}
	case verbDim:
		// Default 30% if no number; otherwise use stated value as the new floor.
		v := 30
		if intent.HasValue {
			v = intent.Value
		}
		return homedevices.Action{Action: "brightness", Brightness: &v}
	case verbBrighten:
		v := 90
		if intent.HasValue {
			v = intent.Value
		}
		return homedevices.Action{Action: "brightness", Brightness: &v}
	case verbOpen:
		v := 0
		return homedevices.Action{Action: "position", Position: &v}
	case verbClose:
		v := 100
		return homedevices.Action{Action: "position", Position: &v}
	}
	return homedevices.Action{Action: "toggle"}
}

// ---- response formatting ---------------------------------------------

func displayName(d homedevices.Device) string {
	if d.DisplayName != "" {
		return d.DisplayName
	}
	if d.Name != "" {
		return d.Name
	}
	return d.LocalID
}

func summarizeResults(intent homeIntent, results []applyResult) string {
	ok := 0
	failed := []string{}
	names := []string{}
	for _, r := range results {
		if r.err != nil {
			failed = append(failed, fmt.Sprintf("%s (%v)", displayName(r.dev), r.err))
			continue
		}
		ok++
		names = append(names, displayName(r.dev))
	}

	verbWord := verbHumanForm(intent)
	if ok == 0 {
		return fmt.Sprintf("Couldn't %s any device. %d failed: %s", verbWord, len(failed), strings.Join(failed, ", "))
	}

	var b strings.Builder
	if ok == 1 {
		fmt.Fprintf(&b, "Done — %s **%s**.", verbWord, names[0])
	} else if ok <= 4 {
		fmt.Fprintf(&b, "Done — %s **%s**.", verbWord, naturalJoin(names))
	} else {
		fmt.Fprintf(&b, "Done — %s %d devices.", verbWord, ok)
	}
	if len(failed) > 0 {
		fmt.Fprintf(&b, " %d failed: %s.", len(failed), strings.Join(failed, ", "))
	}
	return b.String()
}

func verbHumanForm(i homeIntent) string {
	switch i.Verb {
	case verbOn:
		return "turned on"
	case verbOff:
		return "turned off"
	case verbToggle:
		return "toggled"
	case verbBrightness:
		if i.HasValue {
			return fmt.Sprintf("set brightness to %d%% on", i.Value)
		}
		return "set brightness on"
	case verbDim:
		if i.HasValue {
			return fmt.Sprintf("dimmed to %d%%", i.Value)
		}
		return "dimmed"
	case verbBrighten:
		if i.HasValue {
			return fmt.Sprintf("brightened to %d%%", i.Value)
		}
		return "brightened"
	case verbOpen:
		return "opened"
	case verbClose:
		return "closed"
	}
	return "updated"
}

func describeDevices(devices []homedevices.Device) string {
	if len(devices) == 0 {
		return "No matching devices."
	}
	on := []string{}
	off := []string{}
	other := []string{}
	for _, d := range devices {
		switch {
		case d.On != nil && *d.On:
			on = append(on, displayName(d))
		case d.On != nil && !*d.On:
			off = append(off, displayName(d))
		default:
			other = append(other, displayName(d))
		}
	}
	var b strings.Builder
	if len(on) > 0 {
		fmt.Fprintf(&b, "**On (%d):** %s", len(on), naturalJoin(on))
	}
	if len(off) > 0 {
		if b.Len() > 0 {
			b.WriteString("  \n")
		}
		fmt.Fprintf(&b, "**Off (%d):** %s", len(off), naturalJoin(off))
	}
	if len(other) > 0 {
		if b.Len() > 0 {
			b.WriteString("  \n")
		}
		fmt.Fprintf(&b, "**Unknown state (%d):** %s", len(other), naturalJoin(other))
	}
	return b.String()
}

func noDeviceFoundMessage(intent homeIntent) string {
	switch {
	case intent.HasType:
		return fmt.Sprintf("Couldn't find any reachable %s to control.", deviceTypeWord(intent.Type, true))
	case intent.All:
		return "No reachable devices found."
	}
	return "I couldn't figure out which device you meant."
}

func deviceTypeWord(t homedevices.DeviceType, plural bool) string {
	switch t {
	case homedevices.TypeLight:
		if plural {
			return "lights"
		}
		return "light"
	case homedevices.TypePlug:
		if plural {
			return "plugs"
		}
		return "plug"
	case homedevices.TypeBlind:
		if plural {
			return "blinds"
		}
		return "blind"
	case homedevices.TypeTV:
		return "tv"
	case homedevices.TypeSpeaker:
		if plural {
			return "speakers"
		}
		return "speaker"
	}
	return string(t)
}

func naturalJoin(items []string) string {
	switch len(items) {
	case 0:
		return ""
	case 1:
		return items[0]
	case 2:
		return items[0] + " and " + items[1]
	}
	head := strings.Join(items[:len(items)-1], ", ")
	return head + ", and " + items[len(items)-1]
}
