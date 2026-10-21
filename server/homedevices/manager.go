package homedevices

import (
	"context"
	"fmt"
	"path/filepath"
	"sync"
	"time"

	"github.com/acanturgut/home-server/logger"
)

// Manager polls all configured bridges on a schedule and exposes a high-level
// API for the HTTP layer (list bridges/devices, mutate, action, pair).
type Manager struct {
	store     *Store
	overrides *OverrideStore
	history   *HistoryStore
	hue       *HueProvider
	dirigera  *DirigeraProvider
	providers map[Kind]Provider // fixed at construction
}

func NewManager(store *Store) *Manager {
	dataDir := filepath.Dir(store.path)
	hue, dirigera := NewHueProvider(), NewDirigeraProvider()
	return &Manager{
		store:     store,
		overrides: NewOverrideStore(dataDir),
		history:   NewHistoryStore(dataDir),
		hue:       hue,
		dirigera:  dirigera,
		providers: map[Kind]Provider{
			KindHue:      hue,
			KindDirigera: dirigera,
			KindWebOS:    NewWebOSProvider(),
			KindHTTP:     NewHTTPProvider(),
		},
	}
}

func (m *Manager) Overrides() *OverrideStore { return m.overrides }

// History exposes the sensor-history store for the HTTP layer.
func (m *Manager) History() *HistoryStore { return m.history }

// Devices returns the latest device snapshot with user overrides (room
// reassignment, custom type, hidden flag) applied on top.
func (m *Manager) Devices() []Device {
	devs := m.store.Devices()
	overrides := m.overrides.All()
	for i := range devs {
		o, ok := overrides[devs[i].ID]
		if !ok {
			continue
		}
		if o.Name != "" {
			devs[i].DisplayName = o.Name
		}
		if o.Room != "" {
			devs[i].Room = o.Room
		}
		if o.Type != "" {
			devs[i].Type = DeviceType(o.Type)
		}
		if o.Hidden {
			devs[i].Hidden = true
		}
	}
	return devs
}

func (m *Manager) Store() *Store { return m.store }

// PairDirigera triggers the IKEA DIRIGERA PKCE pairing handshake against the
// hub at `host`. Blocks until the user presses the hub's action button or the
// context is cancelled. Returns the long-lived access token.
func (m *Manager) PairDirigera(ctx context.Context, host, clientName string) (string, error) {
	return m.dirigera.Pair(ctx, host, clientName)
}

// PairHue mints a Hue application key; press the bridge's link button first.
func (m *Manager) PairHue(ctx context.Context, host string) (string, error) {
	return m.hue.Pair(ctx, host)
}

// PollOnce discovers devices for every bridge concurrently. Errors per-bridge
// are stored on the bridge but don't abort the loop.
func (m *Manager) PollOnce(ctx context.Context) {
	bridges := m.store.Bridges()
	var wg sync.WaitGroup
	for _, b := range bridges {
		prov, ok := m.providers[b.Kind]
		if !ok {
			m.store.SetBridgeStatus(b.ID, "error", "no provider for kind "+string(b.Kind))
			continue
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
			defer cancel()
			devs, err := prov.Discover(cctx, b)
			// Log state changes only: a flaky hub would otherwise log an
			// error every poll. The bridge status shows the current state.
			if err != nil {
				if m.store.SetBridgeStatus(b.ID, "error", err.Error()) != "error" {
					logger.Error(fmt.Sprintf("homedevices: %s (%s) discover failed: %v", b.Name, b.Kind, err))
				}
				return
			}
			if m.store.SetBridgeStatus(b.ID, "ok", "") == "error" {
				logger.Info(fmt.Sprintf("homedevices: %s (%s) reachable again", b.Name, b.Kind))
			}
			m.store.ReplaceDevices(b.ID, devs)
		}()
	}
	wg.Wait()

	// Record sensor history after the snapshot is fresh. Done outside the
	// per-bridge goroutines so we batch all sensors in one pass.
	now := time.Now()
	for _, d := range m.store.Devices() {
		m.history.Record(d, now)
	}
}

// Run starts the background polling loop. Stops when ctx is cancelled.
func (m *Manager) Run(ctx context.Context, every time.Duration) {
	if every <= 0 {
		every = 15 * time.Second
	}
	m.PollOnce(ctx)
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			m.PollOnce(ctx)
		}
	}
}

// Apply executes an action on a device by global ID, then re-polls just that
// bridge so the UI reflects the new state quickly.
func (m *Manager) Apply(ctx context.Context, deviceID string, a Action) error {
	dev, ok := m.store.Device(deviceID)
	if !ok {
		return fmt.Errorf("device %s not found", deviceID)
	}
	bridge, ok := m.store.Bridge(dev.BridgeID)
	if !ok {
		return fmt.Errorf("bridge %s not found", dev.BridgeID)
	}
	prov, ok := m.providers[bridge.Kind]
	if !ok {
		return fmt.Errorf("no provider for %s", bridge.Kind)
	}
	if err := prov.Apply(ctx, bridge, dev.LocalID, a); err != nil {
		return err
	}
	// Refresh just this bridge.
	go func() {
		bctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		if devs, err := prov.Discover(bctx, bridge); err == nil {
			m.store.ReplaceDevices(bridge.ID, devs)
		}
	}()
	return nil
}
