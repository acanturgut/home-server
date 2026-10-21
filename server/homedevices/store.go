package homedevices

import (
	"fmt"
	"path/filepath"
	"sync"
	"time"

	"github.com/acanturgut/home-server/jsonfile"
	"github.com/acanturgut/home-server/logger"
	"github.com/google/uuid"
)

// Store persists the list of configured Bridges to a JSON file in DATA_DIR.
// Device snapshots themselves are kept in-memory only (re-discovered on poll).
type Store struct {
	mu      sync.RWMutex
	bridges []Bridge
	devices map[string]Device // keyed by Device.ID
	path    string
	updated time.Time
}

func NewStore(dataDir string) *Store {
	s := &Store{
		path:    filepath.Join(dataDir, "home_devices.json"),
		devices: map[string]Device{},
	}
	if err := jsonfile.Load(s.path, &s.bridges); err != nil {
		logger.Error("homedevices: " + err.Error())
	}
	return s
}

// save persists the bridge list without the runtime status fields.
func (s *Store) save() error {
	out := make([]Bridge, len(s.bridges))
	for i, b := range s.bridges {
		b.Status, b.Error = "", ""
		out[i] = b
	}
	return jsonfile.Save(s.path, out)
}

func (s *Store) Bridges() []Bridge {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Bridge, len(s.bridges))
	copy(out, s.bridges)
	return out
}

func (s *Store) Bridge(id string) (Bridge, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, b := range s.bridges {
		if b.ID == id {
			return b, true
		}
	}
	return Bridge{}, false
}

func (s *Store) AddBridge(b Bridge) (Bridge, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if b.ID == "" {
		b.ID = uuid.New().String()
	}
	if b.Added.IsZero() {
		b.Added = time.Now()
	}
	s.bridges = append(s.bridges, b)
	if err := s.save(); err != nil {
		return Bridge{}, err
	}
	return b, nil
}

func (s *Store) UpdateBridge(b Bridge) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, existing := range s.bridges {
		if existing.ID == b.ID {
			b.Added = existing.Added
			b.Status, b.Error = existing.Status, existing.Error
			s.bridges[i] = b
			return s.save()
		}
	}
	return fmt.Errorf("bridge %s not found", b.ID)
}

func (s *Store) DeleteBridge(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, b := range s.bridges {
		if b.ID == id {
			s.bridges = append(s.bridges[:i], s.bridges[i+1:]...)
			// Drop cached devices belonging to this bridge.
			for did, d := range s.devices {
				if d.BridgeID == id {
					delete(s.devices, did)
				}
			}
			return s.save()
		}
	}
	return fmt.Errorf("bridge %s not found", id)
}

// SetBridgeStatus updates runtime status fields without persisting and
// returns the previous status, so callers can act on transitions atomically.
func (s *Store) SetBridgeStatus(id, status, errMsg string) (prev string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, b := range s.bridges {
		if b.ID == id {
			prev = b.Status
			s.bridges[i].Status = status
			s.bridges[i].Error = errMsg
			return prev
		}
	}
	return ""
}

// ReplaceDevices swaps in the latest snapshot for one bridge.
func (s *Store) ReplaceDevices(bridgeID string, devs []Device) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Drop existing devices for this bridge.
	for did, d := range s.devices {
		if d.BridgeID == bridgeID {
			delete(s.devices, did)
		}
	}
	for _, d := range devs {
		s.devices[d.ID] = d
	}
	s.updated = time.Now()
}

// Devices returns a snapshot of all currently known devices.
func (s *Store) Devices() []Device {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Device, 0, len(s.devices))
	for _, d := range s.devices {
		out = append(out, d)
	}
	return out
}

func (s *Store) Device(id string) (Device, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	d, ok := s.devices[id]
	return d, ok
}

func (s *Store) LastUpdated() time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.updated
}
