package homedevices

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// HueProvider talks to the Philips Hue Bridge v1 REST API. The user must
// supply Bridge.Host (LAN IP) and Bridge.Token (the application key, created
// once via POST /api after pressing the bridge link button).
type HueProvider struct {
	client *http.Client
}

func NewHueProvider() *HueProvider {
	return &HueProvider{
		client: &http.Client{
			Timeout: 5 * time.Second,
			// Hue v2 uses a self-signed cert; v1 (used here) is plain HTTP. Be lenient.
			Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}},
		},
	}
}

func (p *HueProvider) Kind() Kind { return KindHue }

type hueLight struct {
	Name  string `json:"name"`
	Type  string `json:"type"`
	State struct {
		On        bool `json:"on"`
		Bri       int  `json:"bri"` // 0..254
		Reachable bool `json:"reachable"`
	} `json:"state"`
}

func (p *HueProvider) Discover(ctx context.Context, b Bridge) ([]Device, error) {
	url := fmt.Sprintf("http://%s/api/%s/lights", b.Host, b.Token)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("hue: %s", string(body))
	}
	// Response is a map of localID -> hueLight.
	var lights map[string]hueLight
	if err := json.Unmarshal(body, &lights); err != nil {
		return nil, fmt.Errorf("hue parse: %w", err)
	}
	out := make([]Device, 0, len(lights))
	now := time.Now()
	for id, l := range lights {
		on := l.State.On
		bri := int(float64(l.State.Bri) / 254.0 * 100.0)
		// Hue exposes smart plugs through the /lights endpoint with a Type
		// like "On/Off plug-in unit". Treat them as plugs (no brightness).
		devType := TypeLight
		t := strings.ToLower(l.Type)
		isPlug := strings.Contains(t, "plug") ||
			strings.Contains(t, "outlet") ||
			strings.Contains(t, "on/off")
		dev := Device{
			ID:         b.ID + ":" + id,
			BridgeID:   b.ID,
			BridgeKind: KindHue,
			LocalID:    id,
			Name:       l.Name,
			Reachable:  l.State.Reachable,
			On:         &on,
			Updated:    now,
		}
		if isPlug {
			devType = TypePlug
		} else {
			dev.Brightness = &bri
		}
		dev.Type = devType
		out = append(out, dev)
	}
	return out, nil
}

func (p *HueProvider) Apply(ctx context.Context, b Bridge, localID string, a Action) error {
	url := fmt.Sprintf("http://%s/api/%s/lights/%s/state", b.Host, b.Token, localID)
	body := map[string]any{}
	switch a.Action {
	case "on":
		body["on"] = true
	case "off":
		body["on"] = false
	case "toggle":
		// Hue has no native toggle: read current state then flip.
		devs, err := p.Discover(ctx, b)
		if err != nil {
			return err
		}
		var cur *Device
		for i := range devs {
			if devs[i].LocalID == localID {
				cur = &devs[i]
				break
			}
		}
		if cur == nil || cur.On == nil {
			return fmt.Errorf("hue: device %s not found", localID)
		}
		body["on"] = !*cur.On
	case "brightness":
		if a.Brightness == nil {
			return fmt.Errorf("hue: brightness required")
		}
		body["on"] = *a.Brightness > 0
		body["bri"] = int(float64(*a.Brightness) / 100.0 * 254.0)
	default:
		return fmt.Errorf("hue: unknown action %s", a.Action)
	}
	buf, _ := json.Marshal(body)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(buf))
	req.Header.Set("Content-Type", "application/json")
	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 || strings.Contains(string(rb), "\"error\"") {
		return fmt.Errorf("hue: %s", string(rb))
	}
	return nil
}
