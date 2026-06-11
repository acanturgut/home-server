package homedevices

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// DirigeraProvider talks to the IKEA DIRIGERA hub REST API (v1). The user
// must supply Bridge.Host (LAN IP) and Bridge.Token (bearer token, generated
// by pressing the action button on the hub during pairing).
type DirigeraProvider struct {
	client *http.Client
}

func NewDirigeraProvider() *DirigeraProvider {
	return &DirigeraProvider{
		client: &http.Client{
			Timeout:   5 * time.Second,
			Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}},
		},
	}
}

func (p *DirigeraProvider) Kind() Kind { return KindDirigera }

type dirigeraDevice struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	DeviceType  string `json:"deviceType"`
	IsReachable bool   `json:"isReachable"`
	Attributes  struct {
		CustomName         string   `json:"customName"`
		Model              string   `json:"model"`
		IsOn               *bool    `json:"isOn,omitempty"`
		LightLevel         *int     `json:"lightLevel,omitempty"`         // 1..100
		BlindsCurrentLevel *int     `json:"blindsCurrentLevel,omitempty"` // 0=open .. 100=closed
		BlindsTargetLevel  *int     `json:"blindsTargetLevel,omitempty"`
		BlindsState        string   `json:"blindsState,omitempty"` // "stopped" | "up" | "down"
		BatteryPercentage  *int     `json:"batteryPercentage,omitempty"`
		CurrentTemperature *float64 `json:"currentTemperature,omitempty"`
		CurrentRH          *int     `json:"currentRH,omitempty"`
		CurrentPM25        *int     `json:"currentPM25,omitempty"`
		VOCIndex           *int     `json:"vocIndex,omitempty"`
	} `json:"attributes"`
	Room *struct {
		Name string `json:"name"`
	} `json:"room,omitempty"`
}

func (p *DirigeraProvider) doRequest(ctx context.Context, method, url, token string, body []byte) (*http.Response, error) {
	var rd io.Reader
	if body != nil {
		rd = bytes.NewReader(body)
	}
	req, _ := http.NewRequestWithContext(ctx, method, url, rd)
	req.Header.Set("Authorization", "Bearer "+token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return p.client.Do(req)
}

func (p *DirigeraProvider) Discover(ctx context.Context, b Bridge) ([]Device, error) {
	url := fmt.Sprintf("https://%s:8443/v1/devices", b.Host)
	resp, err := p.doRequest(ctx, http.MethodGet, url, b.Token, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("dirigera: %s", string(body))
	}
	var raw []dirigeraDevice
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("dirigera parse: %w", err)
	}
	out := make([]Device, 0, len(raw))
	now := time.Now()
	for _, d := range raw {
		dev := Device{
			ID:         b.ID + ":" + d.ID,
			BridgeID:   b.ID,
			BridgeKind: KindDirigera,
			LocalID:    d.ID,
			Name:       d.Attributes.CustomName,
			Reachable:  d.IsReachable,
			Updated:    now,
		}
		if dev.Name == "" {
			dev.Name = d.Attributes.Model
		}
		if d.Room != nil {
			dev.Room = d.Room.Name
		}
		switch strings.ToLower(d.DeviceType) {
		case "light":
			dev.Type = TypeLight
		case "outlet":
			dev.Type = TypePlug
		case "blinds", "shutter":
			dev.Type = TypeBlind
		case "controller", "shortcutcontroller", "soundcontroller", "lightcontroller", "remotecontroller":
			dev.Type = TypeRemote
		case "environmentsensor", "motionsensor", "openclosesensor", "watersensor":
			dev.Type = TypeSensor
		case "speaker":
			dev.Type = TypeSpeaker
		default:
			dev.Type = TypeOther
		}
		if d.Attributes.IsOn != nil {
			v := *d.Attributes.IsOn
			dev.On = &v
		}
		if d.Attributes.LightLevel != nil {
			v := *d.Attributes.LightLevel
			dev.Brightness = &v
		}
		if d.Attributes.BlindsCurrentLevel != nil {
			v := *d.Attributes.BlindsCurrentLevel
			dev.Position = &v
		} else if d.Attributes.BlindsTargetLevel != nil {
			v := *d.Attributes.BlindsTargetLevel
			dev.Position = &v
		}
		if d.Attributes.BatteryPercentage != nil {
			v := *d.Attributes.BatteryPercentage
			dev.Battery = &v
		}
		if d.Attributes.CurrentTemperature != nil {
			v := *d.Attributes.CurrentTemperature
			dev.Temp = &v
		}
		if d.Attributes.CurrentRH != nil {
			v := *d.Attributes.CurrentRH
			dev.Humidity = &v
		}
		if d.Attributes.CurrentPM25 != nil {
			v := *d.Attributes.CurrentPM25
			dev.PM25 = &v
		}
		if d.Attributes.VOCIndex != nil {
			v := *d.Attributes.VOCIndex
			dev.VOC = &v
		}
		out = append(out, dev)
	}
	return out, nil
}

func (p *DirigeraProvider) Apply(ctx context.Context, b Bridge, localID string, a Action) error {
	attrs := map[string]any{}
	switch a.Action {
	case "on":
		attrs["isOn"] = true
	case "off":
		attrs["isOn"] = false
	case "toggle":
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
			return fmt.Errorf("dirigera: device %s not found", localID)
		}
		attrs["isOn"] = !*cur.On
	case "brightness":
		if a.Brightness == nil {
			return fmt.Errorf("dirigera: brightness required")
		}
		attrs["lightLevel"] = *a.Brightness
		attrs["isOn"] = *a.Brightness > 0
	case "position":
		if a.Position == nil {
			return fmt.Errorf("dirigera: position required")
		}
		// 0 = open, 100 = closed.
		p := *a.Position
		if p < 0 {
			p = 0
		}
		if p > 100 {
			p = 100
		}
		attrs["blindsTargetLevel"] = p
	case "stop":
		// Halt blind motion at the current physical position. DIRIGERA accepts
		// a state transition or a target equal to the current level; the latter
		// is the more reliable trigger across firmware revisions.
		attrs["blindsState"] = "stopped"
	default:
		return fmt.Errorf("dirigera: unknown action %s", a.Action)
	}
	body, _ := json.Marshal([]map[string]any{{"attributes": attrs}})
	url := fmt.Sprintf("https://%s:8443/v1/devices/%s", b.Host, localID)
	resp, err := p.doRequest(ctx, http.MethodPatch, url, b.Token, body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		rb, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("dirigera: %s", string(rb))
	}
	return nil
}

// --- Pairing (PKCE-style) ---------------------------------------------------
// DIRIGERA exposes an OAuth-like PKCE flow on https://<hub>:8443.
//   1. POST /v1/oauth/authorize → returns a one-time `code`.
//   2. User presses the physical action button on the hub.
//   3. POST /v1/oauth/token (polled until 200) → returns `access_token`.
// The token never expires and is reusable across restarts.

// dirigeraStartPair fetches the one-time code + returns the verifier needed
// to exchange it for an access token after the user presses the button.
func (p *DirigeraProvider) dirigeraStartPair(ctx context.Context, host string) (code, verifier string, err error) {
	verifier = pkceVerifier()
	chal := pkceChallenge(verifier)
	form := url.Values{
		"audience":              {"homesmart.local"},
		"response_type":         {"code"},
		"code_challenge":        {chal},
		"code_challenge_method": {"S256"},
	}
	u := fmt.Sprintf("https://%s:8443/v1/oauth/authorize?%s", host, form.Encode())
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	resp, err := p.client.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("dirigera authorize: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", "", fmt.Errorf("dirigera authorize: HTTP %d %s", resp.StatusCode, string(body))
	}
	var out struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(body, &out); err != nil || out.Code == "" {
		return "", "", fmt.Errorf("dirigera authorize: bad response %s", string(body))
	}
	return out.Code, verifier, nil
}

// dirigeraExchange does ONE token exchange attempt. Returns ("", nil) when the
// hub answers but the user hasn't pressed the button yet, and (token, nil) on
// success. A non-nil error is a hard failure (network, expired code, …).
func (p *DirigeraProvider) dirigeraExchange(ctx context.Context, host, code, verifier, name string) (string, error) {
	form := url.Values{
		"code":          {code},
		"name":          {name},
		"grant_type":    {"authorization_code"},
		"code_verifier": {verifier},
	}
	u := fmt.Sprintf("https://%s:8443/v1/oauth/token", host)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, u, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := p.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("dirigera token: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == 200 {
		var out struct {
			AccessToken string `json:"access_token"`
		}
		if err := json.Unmarshal(body, &out); err != nil || out.AccessToken == "" {
			return "", fmt.Errorf("dirigera token: bad response %s", string(body))
		}
		return out.AccessToken, nil
	}
	// 403 = button not pressed yet — keep polling.
	if resp.StatusCode == 403 {
		return "", nil
	}
	return "", fmt.Errorf("dirigera token: HTTP %d %s", resp.StatusCode, string(body))
}

// Pair runs the full pairing handshake against the hub at `host`. It blocks
// until the user presses the action button on the hub OR the context is
// cancelled (use a context with a timeout, e.g. 90s). Returns the access
// token on success.
func (p *DirigeraProvider) Pair(ctx context.Context, host, clientName string) (string, error) {
	if clientName == "" {
		clientName = "home-server"
	}
	code, verifier, err := p.dirigeraStartPair(ctx, host)
	if err != nil {
		return "", err
	}
	tick := time.NewTicker(2 * time.Second)
	defer tick.Stop()
	// Try immediately, then on every tick.
	for {
		token, err := p.dirigeraExchange(ctx, host, code, verifier, clientName)
		if err != nil {
			return "", err
		}
		if token != "" {
			return token, nil
		}
		select {
		case <-ctx.Done():
			return "", fmt.Errorf("dirigera: timed out waiting for action button press")
		case <-tick.C:
		}
	}
}

func pkceVerifier() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func pkceChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
