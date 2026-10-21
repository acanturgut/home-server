package homedevices

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// noURL drops the request URL from a transport error. Hue puts the app key
// in the URL path, so it must never reach the logs or the UI.
func noURL(err error) error {
	var ue *url.Error
	if errors.As(err, &ue) {
		return fmt.Errorf("hue: %s request failed: %w", ue.Op, ue.Err)
	}
	return err
}

// HueProvider talks to the Philips Hue Bridge v1 REST API (plain HTTP on the
// LAN). Bridge.Host is the bridge IP and Bridge.Token the application key
// minted by Pair.
type HueProvider struct {
	client *http.Client
}

func NewHueProvider() *HueProvider {
	return &HueProvider{client: &http.Client{Timeout: 5 * time.Second}}
}

// Pair mints an application key on the bridge at host. The bridge's link
// button must have been pressed within the last 30 seconds.
func (p *HueProvider) Pair(ctx context.Context, host string) (string, error) {
	body := strings.NewReader(`{"devicetype":"home-server#dashboard"}`)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://"+host+"/api", body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := p.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("hue: %w", err)
	}
	defer resp.Body.Close()
	var res []struct {
		Success *struct {
			Username string `json:"username"`
		} `json:"success"`
		Error *struct {
			Description string `json:"description"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil || len(res) == 0 {
		return "", errors.New("hue: unexpected response from bridge")
	}
	if s := res[0].Success; s != nil && s.Username != "" {
		return s.Username, nil
	}
	if e := res[0].Error; e != nil {
		return "", errors.New("hue: " + e.Description)
	}
	return "", errors.New("hue: pairing failed")
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
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, noURL(err)
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
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := p.client.Do(req)
	if err != nil {
		return noURL(err)
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 || strings.Contains(string(rb), "\"error\"") {
		return fmt.Errorf("hue: %s", string(rb))
	}
	return nil
}
