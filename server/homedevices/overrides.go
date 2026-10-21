package homedevices

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// DeviceOverride captures user customisations for a discovered device that
// should survive bridge re-pairing and re-polling. Stored separately from the
// in-memory device snapshot so we don't lose them when devices come and go.
type DeviceOverride struct {
	Name   string `json:"name,omitempty"`   // user-friendly display name (overrides bridge-reported name)
	Room   string `json:"room,omitempty"`   // user-assigned room (overrides bridge-reported room)
	Type   string `json:"type,omitempty"`   // user-assigned device type (overrides auto-detected)
	Hidden bool   `json:"hidden,omitempty"` // hide from main view (still controllable from "hidden" tab)
}

// OverrideStore persists per-device overrides keyed by global device ID.
type OverrideStore struct {
	mu   sync.RWMutex
	data map[string]DeviceOverride
	path string
}

func NewOverrideStore(dataDir string) *OverrideStore {
	_ = os.MkdirAll(dataDir, 0755)
	s := &OverrideStore{
		path: filepath.Join(dataDir, "home_device_overrides.json"),
		data: map[string]DeviceOverride{},
	}
	if raw, err := os.ReadFile(s.path); err == nil {
		_ = json.Unmarshal(raw, &s.data)
	}
	return s
}

func (s *OverrideStore) All() map[string]DeviceOverride {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[string]DeviceOverride, len(s.data))
	for k, v := range s.data {
		out[k] = v
	}
	return out
}

// Set merges the given override on top of any existing one. An empty Room
// string clears the room override; Hidden is always replaced.
func (s *OverrideStore) Set(id string, o DeviceOverride) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	// If everything is empty/false → drop the entry entirely.
	if o.Name == "" && o.Room == "" && o.Type == "" && !o.Hidden {
		delete(s.data, id)
	} else {
		s.data[id] = o
	}
	return s.save()
}

func (s *OverrideStore) save() error {
	raw, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, raw, 0644)
}
