package assistant

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Settings holds user-editable runtime preferences.
type Settings struct {
	DefaultTemperature float64 `json:"defaultTemperature"` // default LLM temperature for new nodes
}

func defaultSettings() Settings {
	return Settings{
		DefaultTemperature: 0.7,
	}
}

// SettingsStore persists Settings to disk.
type SettingsStore struct {
	mu       sync.RWMutex
	settings Settings
	path     string
}

func NewSettingsStore(dataDir string) *SettingsStore {
	os.MkdirAll(dataDir, 0755)
	s := &SettingsStore{
		path:     filepath.Join(dataDir, "settings.json"),
		settings: defaultSettings(),
	}
	s.load()
	return s
}

func (s *SettingsStore) load() {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return
	}
	var loaded Settings
	if json.Unmarshal(data, &loaded) != nil {
		return
	}
	// merge — only overwrite when the loaded value is non-zero so newly
	// added fields keep their defaults.
	if loaded.DefaultTemperature > 0 {
		s.settings.DefaultTemperature = loaded.DefaultTemperature
	}
}

func (s *SettingsStore) save() error {
	data, err := json.MarshalIndent(s.settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0644)
}

func (s *SettingsStore) Get() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settings
}

// Update accepts a partial settings update. Numeric fields are only applied
// when > 0.
func (s *SettingsStore) Update(p Settings) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if p.DefaultTemperature > 0 && p.DefaultTemperature <= 2 {
		s.settings.DefaultTemperature = p.DefaultTemperature
	}
	return s.save()
}

func (s *SettingsStore) Reset() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.settings = defaultSettings()
	return s.save()
}
