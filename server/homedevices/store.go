package homedevices

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

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
	_ = os.MkdirAll(dataDir, 0755)
	s := &Store{
		path:    filepath.Join(dataDir, "home_devices.json"),
		devices: map[string]Device{},
	}
	s.load()
	return s
}

func (s *Store) load() {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return
	}
	_ = json.Unmarshal(data, &s.bridges)
}

func (s *Store) save() error {
	data, err := json.MarshalIndent(s.bridges, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0644)
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
			// Preserve Added timestamp.
			b.Added = existing.Added
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

// SetBridgeStatus updates runtime status fields without persisting.
func (s *Store) SetBridgeStatus(id, status, errMsg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, b := range s.bridges {
		if b.ID == id {
			s.bridges[i].Status = status
			s.bridges[i].Error = errMsg
			return
		}
	}
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
