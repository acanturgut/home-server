package homedevices

import (
	"context"
	"fmt"
	"net"
	"time"
)

// WebOSProvider talks to LG webOS TVs over the LAN. Full control normally
// requires a websocket "ssap://" pairing flow with a per-app client key, which
// is too involved for first-pass — here we expose:
//   - reachability ping (TCP dial port 3000),
//   - on/off intent: "off" sends ssap power-off (TODO: needs paired key),
//     "on"  is a no-op placeholder (use Wake-on-LAN node).
//
// The TV is surfaced as a single Device (Type: TypeTV) per Bridge.
type WebOSProvider struct{}

func NewWebOSProvider() *WebOSProvider { return &WebOSProvider{} }

func (p *WebOSProvider) Kind() Kind { return KindWebOS }

func (p *WebOSProvider) Discover(ctx context.Context, b Bridge) ([]Device, error) {
	// Best-effort reachability probe: webOS TVs listen on tcp/3000 (ssap).
	reachable := false
	on := false
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(b.Host, "3000"), 2*time.Second)
	if err == nil {
		reachable = true
		on = true
		_ = conn.Close()
	}
	name := b.Name
	if name == "" {
		name = "LG TV"
	}
	dev := Device{
		ID:         b.ID + ":tv",
		BridgeID:   b.ID,
		BridgeKind: KindWebOS,
		LocalID:    "tv",
		Name:       name,
		Type:       TypeTV,
		Reachable:  reachable,
		On:         &on,
		Updated:    time.Now(),
	}
	return []Device{dev}, nil
}

func (p *WebOSProvider) Apply(ctx context.Context, b Bridge, localID string, a Action) error {
	// Real ssap power/volume control requires the websocket pairing flow.
	// Until that's implemented we surface a clear error so the UI can show it.
	return fmt.Errorf("webos: control not implemented yet — pair via the LG remote app, then add the client key here")
}
