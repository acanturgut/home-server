package homedevices

import (
	"path/filepath"
	"sync"

	"github.com/acanturgut/home-server/jsonfile"
	"github.com/acanturgut/home-server/logger"
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
	s := &OverrideStore{
		path: filepath.Join(dataDir, "home_device_overrides.json"),
		data: map[string]DeviceOverride{},
	}
	if err := jsonfile.Load(s.path, &s.data); err != nil {
		logger.Error("homedevices: " + err.Error())
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

// Set replaces the device's override; an all-empty override removes it.
func (s *OverrideStore) Set(id string, o DeviceOverride) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	// If everything is empty/false → drop the entry entirely.
	if o.Name == "" && o.Room == "" && o.Type == "" && !o.Hidden {
		delete(s.data, id)
	} else {
		s.data[id] = o
	}
	return jsonfile.Save(s.path, s.data)
}
