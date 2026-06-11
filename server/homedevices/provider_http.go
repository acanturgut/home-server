package homedevices

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// HTTPProvider exposes a single device controlled by user-supplied URLs.
// Bridge.Config keys consumed:
//
//	on_url       — required, GET this URL to turn on
//	off_url      — required, GET this URL to turn off
//	status_url   — optional, GET; non-empty / "on" / "true" body means on
//	method       — optional, default GET (also POST)
//	device_type  — optional ("light"|"plug"|"tv"|"speaker"|"other")
type HTTPProvider struct {
	client *http.Client
}

func NewHTTPProvider() *HTTPProvider {
	return &HTTPProvider{client: &http.Client{Timeout: 4 * time.Second}}
}

func (p *HTTPProvider) Kind() Kind { return KindHTTP }

func (p *HTTPProvider) Discover(ctx context.Context, b Bridge) ([]Device, error) {
	dt := DeviceType(b.Config["device_type"])
	if dt == "" {
		dt = TypePlug
	}
	reachable := true
	var on *bool
	if statusURL := b.Config["status_url"]; statusURL != "" {
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, statusURL, nil)
		resp, err := p.client.Do(req)
		if err != nil {
			reachable = false
		} else {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			s := strings.ToLower(strings.TrimSpace(string(body)))
			v := s == "on" || s == "true" || s == "1" || strings.Contains(s, "\"on\":true")
			on = &v
		}
	}
	dev := Device{
		ID:         b.ID + ":1",
		BridgeID:   b.ID,
		BridgeKind: KindHTTP,
		LocalID:    "1",
		Name:       b.Name,
		Type:       dt,
		Reachable:  reachable,
		On:         on,
		Updated:    time.Now(),
	}
	return []Device{dev}, nil
}

func (p *HTTPProvider) Apply(ctx context.Context, b Bridge, localID string, a Action) error {
	method := strings.ToUpper(b.Config["method"])
	if method == "" {
		method = http.MethodGet
	}
	var url string
	switch a.Action {
	case "on":
		url = b.Config["on_url"]
	case "off":
		url = b.Config["off_url"]
	case "toggle":
		// Best-effort: if status_url present, read it; otherwise default to "on".
		devs, _ := p.Discover(ctx, b)
		if len(devs) > 0 && devs[0].On != nil && *devs[0].On {
			url = b.Config["off_url"]
		} else {
			url = b.Config["on_url"]
		}
	default:
		return fmt.Errorf("http: action %s not supported", a.Action)
	}
	if url == "" {
		return fmt.Errorf("http: %s_url not configured", a.Action)
	}
	req, _ := http.NewRequestWithContext(ctx, method, url, nil)
	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("http: status %d", resp.StatusCode)
	}
	return nil
}
