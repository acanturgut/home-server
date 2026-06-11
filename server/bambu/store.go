package bambu

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Store persists the list of configured printers to
// `${DataDir}/bambu_printers.json`. Concurrency-safe; safe to call from
// HTTP handlers and the manager goroutines simultaneously.
type Store struct {
	path string
	mu   sync.RWMutex
	cur  []Printer
}

func NewStore(dataDir string) *Store {
	s := &Store{path: filepath.Join(dataDir, "bambu_printers.json")}
	s.load()
	return s
}

func (s *Store) load() {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return
	}
	var list []Printer
	if err := json.Unmarshal(data, &list); err != nil {
		return
	}
	s.cur = list
}

func (s *Store) persistLocked() error {
	tmp := s.path + ".tmp"
	data, err := json.MarshalIndent(s.cur, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// List returns a copy of the current printers, sorted by name.
func (s *Store) List() []Printer {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Printer, len(s.cur))
	copy(out, s.cur)
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name) })
	return out
}

// Get returns the printer with the given ID.
func (s *Store) Get(id string) (Printer, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, p := range s.cur {
		if p.ID == id {
			return p, true
		}
	}
	return Printer{}, false
}

// Add validates the input, generates an ID and persists it.
func (s *Store) Add(p Printer) (Printer, error) {
	p.Name = strings.TrimSpace(p.Name)
	p.Host = strings.TrimSpace(p.Host)
	p.Serial = strings.TrimSpace(p.Serial)
	p.AccessCode = strings.TrimSpace(p.AccessCode)
	p.Model = strings.TrimSpace(p.Model)
	if p.Name == "" {
		return Printer{}, errors.New("name is required")
	}
	if p.Host == "" {
		return Printer{}, errors.New("host (LAN IP) is required")
	}
	if p.Serial == "" {
		return Printer{}, errors.New("serial is required")
	}
	if p.AccessCode == "" {
		return Printer{}, errors.New("access code is required")
	}
	p.ID = randomID()
	p.CreatedAt = time.Now().UTC()

	s.mu.Lock()
	defer s.mu.Unlock()
	s.cur = append(s.cur, p)
	if err := s.persistLocked(); err != nil {
		return Printer{}, err
	}
	return p, nil
}

// Update replaces the entry with the given ID. Empty AccessCode means "keep".
func (s *Store) Update(id string, in Printer) (Printer, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, p := range s.cur {
		if p.ID != id {
			continue
		}
		if v := strings.TrimSpace(in.Name); v != "" {
			p.Name = v
		}
		if v := strings.TrimSpace(in.Host); v != "" {
			p.Host = v
		}
		if v := strings.TrimSpace(in.Serial); v != "" {
			p.Serial = v
		}
		if v := strings.TrimSpace(in.AccessCode); v != "" {
			p.AccessCode = v
		}
		if v := strings.TrimSpace(in.Model); v != "" {
			p.Model = v
		}
		s.cur[i] = p
		if err := s.persistLocked(); err != nil {
			return Printer{}, err
		}
		return p, nil
	}
	return Printer{}, fmt.Errorf("printer %q not found", id)
}

func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.cur[:0]
	found := false
	for _, p := range s.cur {
		if p.ID == id {
			found = true
			continue
		}
		out = append(out, p)
	}
	if !found {
		return fmt.Errorf("printer %q not found", id)
	}
	s.cur = out
	return s.persistLocked()
}

func randomID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("p-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b[:])
}
