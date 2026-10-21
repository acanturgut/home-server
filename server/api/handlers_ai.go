package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/acanturgut/home-server/ai"
	"github.com/acanturgut/home-server/auth"
	"github.com/acanturgut/home-server/homedevices"
	"github.com/acanturgut/home-server/logger"
	"github.com/google/uuid"
)

// The voice/ask pipeline boils down to "string in, string out". It powers
// the iPhone Shortcut and any curl script.
//
// Pipeline:
//  1. Try to handle as a direct home-control intent ("turn off the kitchen
//     lights"). If matched, run the action and speak the result.
//  2. Otherwise inject a snapshot of the home (sensors, lights, plugs,
//     blinds) as a system message so the LLM can answer questions like
//     "what's the temperature in the bedroom?" or "are any windows open?".
//  3. Hand off to router.Chat — same model selection logic the web chat uses.
const askSystemPrompt = `You are a friendly home assistant heard out loud through a voice client.
Reply in 1-3 short sentences. Use plain spoken English (no markdown, no code, no lists, no emoji).
Round numbers and use natural phrasing ("about twenty-one degrees" instead of "20.3°C").
Output only the final spoken answer. Do NOT include reasoning, analysis, "let me think", thought tags, <think>, <reasoning>, scratchpad, or any chain-of-thought. The user only hears your reply, so any preamble will sound broken.
You will be given a HOME STATE snapshot describing the user's smart-home devices and current sensor readings. Use it to answer questions about the home directly. If the user asks about something not in the snapshot, say you don't know rather than inventing data.`

type askReq struct {
	Prompt string `json:"prompt"`
}

type askResp struct {
	Reply   string `json:"reply"`
	Model   string `json:"model,omitempty"`
	Node    string `json:"node,omitempty"`
	Handler string `json:"handler,omitempty"` // "home" | "llm"
}

// AIAsk handles POST /api/ai/ask.
func (h *Handler) AIAsk(w http.ResponseWriter, r *http.Request) {
	if !h.askAllowed(r) {
		writeJSON(w, http.StatusUnauthorized, askResp{Reply: "Sorry, I couldn't talk to your home server. Sign in or set an API token."})
		return
	}
	var req askReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, askResp{Reply: "I didn't catch that. Try asking again."})
		return
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		writeJSON(w, http.StatusBadRequest, askResp{Reply: "I didn't catch that. Try asking again."})
		return
	}

	if reply, handled := h.ai.TryHomeIntent(r.Context(), prompt); handled {
		writeJSON(w, http.StatusOK, askResp{Reply: speakable(reply), Handler: "home"})
		return
	}

	messages := []ai.Message{{Role: "system", Content: askSystemPrompt}}
	if ctxMsg := h.buildAskHomeContext(); ctxMsg != "" {
		messages = append(messages, ai.Message{Role: "system", Content: ctxMsg})
	}
	messages = append(messages, ai.Message{Role: "user", Content: prompt})

	resp, err := h.ai.Chat(r.Context(), uuid.New().String(), messages)
	if err != nil {
		logger.Error("ai/ask chat: " + err.Error())
		writeJSON(w, http.StatusBadGateway, askResp{Reply: "I had trouble reaching the model. Please try again in a moment."})
		return
	}
	reply := strings.TrimSpace(resp.Message.Content)
	if reply == "" {
		reply = "I don't have an answer for that."
	}
	writeJSON(w, http.StatusOK, askResp{
		Reply:   speakable(reply),
		Model:   resp.Model,
		Node:    resp.Node,
		Handler: "llm",
	})
}

// ---- helpers -----------------------------------------------------------

// buildAskHomeContext renders the current home-device snapshot as a compact
// system message the LLM can quote from. Returns "" when no devices known.
func (h *Handler) buildAskHomeContext() string {
	devices := h.home.Devices()
	if len(devices) == 0 {
		return ""
	}

	var (
		sensors   []homedevices.Device
		lights    []homedevices.Device
		plugs     []homedevices.Device
		blinds    []homedevices.Device
		tvs       []homedevices.Device
		others    []homedevices.Device
		lowBatts  []homedevices.Device
		offlines  []homedevices.Device
		roomNames = map[string]struct{}{}
	)
	for _, d := range devices {
		if d.Hidden {
			continue
		}
		if d.Room != "" {
			roomNames[d.Room] = struct{}{}
		}
		switch d.Type {
		case homedevices.TypeSensor:
			sensors = append(sensors, d)
		case homedevices.TypeLight:
			lights = append(lights, d)
		case homedevices.TypePlug:
			plugs = append(plugs, d)
		case homedevices.TypeBlind:
			blinds = append(blinds, d)
		case homedevices.TypeTV:
			tvs = append(tvs, d)
		default:
			others = append(others, d)
		}
		if d.Battery != nil && *d.Battery <= 20 {
			lowBatts = append(lowBatts, d)
		}
		if !d.Reachable {
			offlines = append(offlines, d)
		}
	}

	var b strings.Builder
	b.WriteString("HOME STATE (snapshot at ")
	b.WriteString(time.Now().Format("Mon 15:04"))
	b.WriteString("):\n")

	if len(roomNames) > 0 {
		rooms := make([]string, 0, len(roomNames))
		for r := range roomNames {
			rooms = append(rooms, r)
		}
		sort.Strings(rooms)
		b.WriteString("Rooms: ")
		b.WriteString(strings.Join(rooms, ", "))
		b.WriteString("\n")
	}

	if len(sensors) > 0 {
		b.WriteString("\nSensors:\n")
		sortByLabel(sensors)
		for _, s := range sensors {
			b.WriteString("- ")
			b.WriteString(deviceTitle(s))
			b.WriteString(": ")
			b.WriteString(sensorReading(s))
			b.WriteString("\n")
		}
	}

	writeSwitchables := func(label string, devs []homedevices.Device) {
		if len(devs) == 0 {
			return
		}
		sortByLabel(devs)
		fmt.Fprintf(&b, "\n%s:\n", label)
		for _, d := range devs {
			b.WriteString("- ")
			b.WriteString(deviceTitle(d))
			b.WriteString(": ")
			b.WriteString(stateSummary(d))
			b.WriteString("\n")
		}
	}
	writeSwitchables("Lights", lights)
	writeSwitchables("Plugs", plugs)
	writeSwitchables("Blinds", blinds)
	if len(tvs) > 0 {
		writeSwitchables("TVs", tvs)
	}
	if len(others) > 0 {
		writeSwitchables("Other", others)
	}

	onLights := 0
	for _, d := range lights {
		if d.On != nil && *d.On {
			onLights++
		}
	}
	if len(lights) > 0 {
		fmt.Fprintf(&b, "\nLights on: %d / %d\n", onLights, len(lights))
	}
	if len(lowBatts) > 0 {
		names := make([]string, 0, len(lowBatts))
		for _, d := range lowBatts {
			names = append(names, deviceTitle(d))
		}
		fmt.Fprintf(&b, "Low battery: %s\n", strings.Join(names, ", "))
	}
	if len(offlines) > 0 {
		names := make([]string, 0, len(offlines))
		for _, d := range offlines {
			names = append(names, deviceTitle(d))
		}
		fmt.Fprintf(&b, "Offline: %s\n", strings.Join(names, ", "))
	}

	return b.String()
}

func deviceTitle(d homedevices.Device) string {
	name := d.DisplayName
	if name == "" {
		name = d.Name
	}
	if d.Room != "" {
		return fmt.Sprintf("%s (%s)", name, d.Room)
	}
	return name
}

func sensorReading(d homedevices.Device) string {
	parts := []string{}
	if d.Temp != nil {
		parts = append(parts, fmt.Sprintf("%.1f°C", *d.Temp))
	}
	if d.Humidity != nil {
		parts = append(parts, fmt.Sprintf("%d%% humidity", *d.Humidity))
	}
	if d.PM25 != nil {
		parts = append(parts, fmt.Sprintf("PM2.5 %d", *d.PM25))
	}
	if d.VOC != nil {
		parts = append(parts, fmt.Sprintf("VOC %d", *d.VOC))
	}
	if d.Battery != nil {
		parts = append(parts, fmt.Sprintf("battery %d%%", *d.Battery))
	}
	if !d.Reachable {
		parts = append(parts, "offline")
	}
	if len(parts) == 0 {
		return "no readings"
	}
	return strings.Join(parts, ", ")
}

func stateSummary(d homedevices.Device) string {
	parts := []string{}
	if d.On != nil {
		if *d.On {
			parts = append(parts, "on")
		} else {
			parts = append(parts, "off")
		}
	}
	if d.Brightness != nil {
		parts = append(parts, fmt.Sprintf("%d%% brightness", *d.Brightness))
	}
	if d.Position != nil {
		parts = append(parts, fmt.Sprintf("position %d%%", *d.Position))
	}
	if !d.Reachable {
		parts = append(parts, "offline")
	}
	if len(parts) == 0 {
		return "unknown"
	}
	return strings.Join(parts, ", ")
}

func sortByLabel(devs []homedevices.Device) {
	sort.Slice(devs, func(i, j int) bool {
		return strings.ToLower(deviceTitle(devs[i])) < strings.ToLower(deviceTitle(devs[j]))
	})
}

// reasoningBlockRE matches <think>…</think> / <thinking>…</thinking> /
// <reasoning>…</reasoning> blocks emitted by reasoning models (DeepSeek R1,
// Qwen QwQ, etc.). They must never reach Siri's TTS. Go's RE2 has no
// backreferences, so we list each tag pair explicitly.
var reasoningBlockRE = regexp.MustCompile(`(?is)<\s*(think|thinking|reasoning|analysis|reflection|scratchpad)\s*>.*?<\s*/\s*(think|thinking|reasoning|analysis|reflection|scratchpad)\s*>`)

// speakable strips characters that confuse Siri's TTS.
func speakable(s string) string {
	s = reasoningBlockRE.ReplaceAllString(s, "")
	// Some models stream the opening tag but get cut off before the closing
	// one — drop everything up to a stray closing reasoning tag so the user
	// hears at least the final answer instead of the chain-of-thought.
	if idx := strings.LastIndex(strings.ToLower(s), "</think>"); idx >= 0 {
		s = s[idx+len("</think>"):]
	}
	if idx := strings.LastIndex(strings.ToLower(s), "</thinking>"); idx >= 0 {
		s = s[idx+len("</thinking>"):]
	}
	if idx := strings.LastIndex(strings.ToLower(s), "</reasoning>"); idx >= 0 {
		s = s[idx+len("</reasoning>"):]
	}
	s = strings.TrimSpace(s)
	for strings.Contains(s, "```") {
		s = strings.ReplaceAll(s, "```", "")
	}
	for _, c := range []string{"**", "__", "`"} {
		s = strings.ReplaceAll(s, c, "")
	}
	s = strings.ReplaceAll(s, "°C", " degrees")
	s = strings.ReplaceAll(s, "°F", " degrees Fahrenheit")
	s = strings.ReplaceAll(s, "°", " degrees")
	for strings.Contains(s, "  ") {
		s = strings.ReplaceAll(s, "  ", " ")
	}
	return strings.TrimSpace(s)
}

// askAllowed authorizes AIAsk: an API token (`Authorization: Bearer`, used
// by Shortcuts and scripts) or a signed-in non-viewer session. Viewers are
// refused because a home intent can switch devices.
func (h *Handler) askAllowed(r *http.Request) bool {
	if hdr := r.Header.Get("Authorization"); len(hdr) > 7 && strings.EqualFold(hdr[:7], "bearer ") {
		return h.tokens.Verify(strings.TrimSpace(hdr[7:]))
	}
	u, ok := h.auth.FromRequest(r)
	return ok && u.Role != auth.RoleViewer
}
