package network

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// Store persists per-MAC overrides (custom display name) to JSON in DATA_DIR.
// MAC keys are normalised to lowercase.
type Override struct {
	Name string `json:"name,omitempty"`
}

type Store struct {
	mu        sync.RWMutex
	path      string
	overrides map[string]Override
}

func NewStore(dataDir string) *Store {
	_ = os.MkdirAll(dataDir, 0755)
	s := &Store{
		path:      filepath.Join(dataDir, "network_overrides.json"),
		overrides: map[string]Override{},
	}
	s.load()
	return s
}

func (s *Store) load() {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return
	}
	_ = json.Unmarshal(data, &s.overrides)
}

func (s *Store) save() error {
	s.mu.RLock()
	data, err := json.MarshalIndent(s.overrides, "", "  ")
	s.mu.RUnlock()
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0644)
}

// Get returns the override for a MAC, if any.
func (s *Store) Get(mac string) (Override, bool) {
	mac = strings.ToLower(mac)
	s.mu.RLock()
	defer s.mu.RUnlock()
	o, ok := s.overrides[mac]
	return o, ok
}

// Set stores or updates the override for a MAC. Empty name removes the entry.
func (s *Store) Set(mac, name string) error {
	mac = strings.ToLower(strings.TrimSpace(mac))
	if mac == "" {
		return nil
	}
	s.mu.Lock()
	if name == "" {
		delete(s.overrides, mac)
	} else {
		s.overrides[mac] = Override{Name: name}
	}
	s.mu.Unlock()
	// Bust the scan cache so the next poll reflects the change.
	cacheMu.Lock()
	cache = Result{}
	cacheMu.Unlock()
	return s.save()
}

// SetName is a package-level shortcut that targets the attached store.
// Returns an error if no store has been attached.
func SetName(mac, name string) error {
	storeRefMu.RLock()
	s := storeRef
	storeRefMu.RUnlock()
	if s == nil {
		return errNoStore
	}
	return s.Set(mac, name)
}

var errNoStore = &storeErr{msg: "network store not attached"}

type storeErr struct{ msg string }

func (e *storeErr) Error() string { return e.msg }
