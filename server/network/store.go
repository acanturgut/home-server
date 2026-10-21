package network

import (
	"path/filepath"
	"strings"
	"sync"

	"github.com/acanturgut/home-server/jsonfile"
	"github.com/acanturgut/home-server/logger"
)

// Override is a user-set customisation for one MAC.
type Override struct {
	Name string `json:"name,omitempty"`
}

// Store persists per-MAC overrides to DATA_DIR. MAC keys are lowercase.
type Store struct {
	mu        sync.RWMutex
	path      string
	overrides map[string]Override
}

func NewStore(dataDir string) *Store {
	s := &Store{
		path:      filepath.Join(dataDir, "network_overrides.json"),
		overrides: map[string]Override{},
	}
	if err := jsonfile.Load(s.path, &s.overrides); err != nil {
		logger.Error("network: " + err.Error())
	}
	return s
}

// Get returns the override for a MAC, if any.
func (s *Store) Get(mac string) (Override, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	o, ok := s.overrides[strings.ToLower(mac)]
	return o, ok
}

// Set stores or updates the override for a MAC. Empty name removes the entry.
func (s *Store) Set(mac, name string) error {
	mac = strings.ToLower(strings.TrimSpace(mac))
	if mac == "" {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if name == "" {
		delete(s.overrides, mac)
	} else {
		s.overrides[mac] = Override{Name: name}
	}
	return jsonfile.Save(s.path, s.overrides)
}
