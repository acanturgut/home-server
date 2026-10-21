package assistant

import (
	"path/filepath"
	"sync"

	"github.com/acanturgut/home-server/jsonfile"
	"github.com/acanturgut/home-server/logger"
)

// Settings holds user-editable runtime preferences.
type Settings struct {
	DefaultTemperature float64 `json:"defaultTemperature"` // default LLM temperature for new nodes
	// RouterModel overrides the env-configured intent classifier model.
	RouterModel string `json:"routerModel,omitempty"`
}

func defaultSettings() Settings {
	return Settings{DefaultTemperature: 0.7}
}

// SettingsStore persists Settings to disk.
type SettingsStore struct {
	mu       sync.RWMutex
	settings Settings
	path     string
}

func NewSettingsStore(dataDir string) *SettingsStore {
	s := &SettingsStore{
		path:     filepath.Join(dataDir, "settings.json"),
		settings: defaultSettings(),
	}
	// Decoding over the defaults keeps them for fields the file predates.
	if err := jsonfile.Load(s.path, &s.settings); err != nil {
		logger.Error("settings: " + err.Error())
	}
	if s.settings.DefaultTemperature <= 0 {
		s.settings.DefaultTemperature = defaultSettings().DefaultTemperature
	}
	return s
}

func (s *SettingsStore) Get() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settings
}

// Update applies a partial update: zero values leave a field unchanged.
func (s *SettingsStore) Update(p Settings) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if p.DefaultTemperature > 0 && p.DefaultTemperature <= 2 {
		s.settings.DefaultTemperature = p.DefaultTemperature
	}
	if p.RouterModel != "" {
		s.settings.RouterModel = p.RouterModel
	}
	return jsonfile.Save(s.path, s.settings)
}

func (s *SettingsStore) Reset() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.settings = defaultSettings()
	return jsonfile.Save(s.path, s.settings)
}
