package homedevices

import (
	"context"
	"fmt"
	"net"
	"time"
)

// WebOSProvider surfaces an LG webOS TV as a single Device (TypeTV) whose
// on/reachable state comes from a TCP probe of the ssap port (3000). Control
// would need the websocket pairing flow with a per-app client key, so Apply
// reports that it isn't supported.
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
	return fmt.Errorf("webos: TV control isn't supported, only on/off status")
}
