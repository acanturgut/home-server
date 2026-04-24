package apps

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type AppStatus string

const (
	StatusBuilding AppStatus = "building"
	StatusRunning  AppStatus = "running"
	StatusStopped  AppStatus = "stopped"
	StatusFailed   AppStatus = "failed"
)

// BuildRecord records a single build attempt.
type BuildRecord struct {
	Action    string    `json:"action"`    // "build", "rebuild", "fix"
	Prompt    string    `json:"prompt"`
	Status    string    `json:"status"`    // "success", "failed"
	Duration  string    `json:"duration"`
	Node      string    `json:"node"`
	Timestamp time.Time `json:"timestamp"`
}

// App describes a deployed application.
type App struct {
	Name        string        `json:"name"`
	Icon        string        `json:"icon,omitempty"`
	Port        int           `json:"port"`
	Healthcheck string        `json:"healthcheck"`
	Route       string        `json:"route"`
	Type        string        `json:"type"`
	Status      AppStatus     `json:"status"`
	Prompt      string        `json:"prompt"`
	Error       string        `json:"error,omitempty"`
	CreatedAt   time.Time     `json:"created_at"`
	UpdatedAt   time.Time     `json:"updated_at"`
	Builds      []BuildRecord `json:"builds,omitempty"`
}

// AppConfig is the app.json format from generated projects.
type AppConfig struct {
	Name        string `json:"name"`
	Icon        string `json:"icon,omitempty"`
	Port        int    `json:"port"`
	Healthcheck string `json:"healthcheck"`
	Route       string `json:"route"`
	Type        string `json:"type"`
}

type Store struct {
	mu       sync.RWMutex
	apps     map[string]*App
	path     string
	appsDir  string
	nextPort int
}

func NewStore(dataDir string) *Store {
	appsDir := filepath.Join(dataDir, "apps")
	os.MkdirAll(appsDir, 0755)
	s := &Store{
		apps:     make(map[string]*App),
		path:     filepath.Join(dataDir, "apps.json"),
		appsDir:  appsDir,
		nextPort: 4001,
	}
	s.load()
	// Find the next available port
	for _, a := range s.apps {
		if a.Port >= s.nextPort {
			s.nextPort = a.Port + 1
		}
	}
	return s
}

func (s *Store) load() {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return
	}
	var apps []*App
	json.Unmarshal(data, &apps)
	for _, a := range apps {
		s.apps[a.Name] = a
	}
}

func (s *Store) save() error {
	apps := make([]*App, 0, len(s.apps))
	for _, a := range s.apps {
		apps = append(apps, a)
	}
	data, err := json.MarshalIndent(apps, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0644)
}

func (s *Store) AllocatePort() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	port := s.nextPort
	s.nextPort++
	return port
}

func (s *Store) Set(app *App) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	app.UpdatedAt = time.Now()
	s.apps[app.Name] = app
	return s.save()
}

func (s *Store) Get(name string) (*App, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	a, ok := s.apps[name]
	if !ok {
		return nil, false
	}
	cp := *a
	return &cp, true
}

func (s *Store) All() []*App {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*App, 0, len(s.apps))
	for _, a := range s.apps {
		cp := *a
		out = append(out, &cp)
	}
	return out
}

func (s *Store) Delete(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.apps, name)
	s.save()
}

func (s *Store) ProjectDir(name string) string {
	return filepath.Join(s.appsDir, name)
}
