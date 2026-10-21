package homedevices

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// Kind identifies the bridge / hub integration type.
type Kind string

const (
	KindHue      Kind = "hue"      // Philips Hue Bridge
	KindDirigera Kind = "dirigera" // IKEA DIRIGERA hub
	KindWebOS    Kind = "webos"    // LG webOS TV
	KindHTTP     Kind = "http"     // Generic HTTP toggle endpoint
)

// Bridge represents a configured hub / smart-home gateway. One Bridge may
// expose many Devices.
type Bridge struct {
	ID     string            `json:"id"`
	Kind   Kind              `json:"kind"`
	Name   string            `json:"name"`
	Host   string            `json:"host"`            // IP or hostname (no scheme)
	Token  string            `json:"token,omitempty"` // app-key / bearer / pairing key
	Config map[string]string `json:"config,omitempty"`
	Added  time.Time         `json:"added"`
	// Runtime status (not persisted)
	Status string `json:"status,omitempty"` // "ok" | "error" | "..."
	Error  string `json:"error,omitempty"`
}

// Validate checks user-supplied fields before a bridge is saved, so a bad
// host or URL can't break every later poll.
func (b Bridge) Validate() error {
	switch b.Kind {
	case KindHue, KindDirigera, KindWebOS, KindHTTP:
	default:
		return fmt.Errorf("unknown bridge kind %q", b.Kind)
	}
	if b.Kind != KindHTTP || b.Host != "" {
		if !validHost(b.Host) {
			return fmt.Errorf("host %q must be an IP or hostname, optionally with :port", b.Host)
		}
	}
	if b.Kind == KindHTTP {
		for _, key := range []string{"on_url", "off_url", "status_url"} {
			if v := b.Config[key]; v != "" {
				u, err := url.Parse(v)
				if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
					return fmt.Errorf("%s must be an http(s) URL", key)
				}
			}
		}
		if m := strings.ToUpper(b.Config["method"]); m != "" && m != "GET" && m != "POST" {
			return fmt.Errorf("method must be GET or POST")
		}
	}
	return nil
}

func validHost(h string) bool {
	if h == "" || strings.ContainsAny(h, " /\\?#@") {
		return false
	}
	u, err := url.Parse("http://" + h)
	return err == nil && u.Host == h && u.Hostname() != ""
}

// DeviceType classifies the underlying physical device.
type DeviceType string

const (
	TypeLight   DeviceType = "light"
	TypePlug    DeviceType = "plug"
	TypeSensor  DeviceType = "sensor"
	TypeBlind   DeviceType = "blind"
	TypeRemote  DeviceType = "remote"
	TypeTV      DeviceType = "tv"
	TypeSpeaker DeviceType = "speaker"
	TypeOther   DeviceType = "other"
)

// Device is a flattened, UI-friendly snapshot of a single addressable device
// produced by a provider during a poll cycle.
type Device struct {
	ID          string     `json:"id"` // globally unique, "<bridgeID>:<localID>"
	BridgeID    string     `json:"bridge_id"`
	BridgeKind  Kind       `json:"bridge_kind"`
	LocalID     string     `json:"local_id"`
	Name        string     `json:"name"`
	DisplayName string     `json:"display_name,omitempty"` // user-set override; falls back to Name in UI
	Type        DeviceType `json:"type"`
	Room        string     `json:"room,omitempty"`
	Reachable   bool       `json:"reachable"`
	On          *bool      `json:"on,omitempty"`         // pointer = unknown
	Brightness  *int       `json:"brightness,omitempty"` // 0..100
	Position    *int       `json:"position,omitempty"`   // 0..100 (blinds: 0=open, 100=closed)
	Color       string     `json:"color,omitempty"`      // hex
	Temp        *float64   `json:"temp,omitempty"`       // for sensors (°C)
	Humidity    *int       `json:"humidity,omitempty"`   // relative humidity 0..100
	PM25        *int       `json:"pm25,omitempty"`       // PM2.5 µg/m³
	VOC         *int       `json:"voc,omitempty"`        // VOC index 0..500
	Battery     *int       `json:"battery,omitempty"`    // 0..100
	Hidden      bool       `json:"hidden,omitempty"`     // user-marked hidden (sticky override)
	Updated     time.Time  `json:"updated"`
}

// Action represents a control request issued from the UI.
type Action struct {
	Action     string `json:"action"`               // "on" | "off" | "toggle" | "brightness" | "position" | "stop"
	Brightness *int   `json:"brightness,omitempty"` // 0..100
	Position   *int   `json:"position,omitempty"`   // 0..100 (blinds)
}

// Provider is a smart-home integration. Implementations handle one Kind.
type Provider interface {
	Kind() Kind
	// Discover lists devices on the bridge. Called by the polling loop.
	Discover(ctx context.Context, b Bridge) ([]Device, error)
	// Apply executes an action against a single device on the bridge.
	Apply(ctx context.Context, b Bridge, localID string, a Action) error
}
