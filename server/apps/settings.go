package apps

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Settings holds user-editable runtime preferences.
type Settings struct {
	AutoFixOnCrash     bool    `json:"autoFixOnCrash"`     // automatically run /fix when a deployed app crashes
	DefaultTemperature float64 `json:"defaultTemperature"` // default LLM temperature for new nodes / build calls
	BuildTimeoutMin    int     `json:"buildTimeoutMin"`    // hard timeout for a build pipeline run, in minutes
	KeepBuildHistory   int     `json:"keepBuildHistory"`   // how many BuildRecord entries to retain per app
}

func defaultSettings() Settings {
	return Settings{
		AutoFixOnCrash:     false,
		DefaultTemperature: 0.7,
		BuildTimeoutMin:    30,
		KeepBuildHistory:   20,
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
	if loaded.BuildTimeoutMin > 0 {
		s.settings.BuildTimeoutMin = loaded.BuildTimeoutMin
	}
	if loaded.KeepBuildHistory > 0 {
		s.settings.KeepBuildHistory = loaded.KeepBuildHistory
	}
	s.settings.AutoFixOnCrash = loaded.AutoFixOnCrash
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
// when > 0; booleans are always applied.
func (s *SettingsStore) Update(p Settings) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if p.DefaultTemperature > 0 && p.DefaultTemperature <= 2 {
		s.settings.DefaultTemperature = p.DefaultTemperature
	}
	if p.BuildTimeoutMin > 0 && p.BuildTimeoutMin <= 240 {
		s.settings.BuildTimeoutMin = p.BuildTimeoutMin
	}
	if p.KeepBuildHistory > 0 && p.KeepBuildHistory <= 200 {
		s.settings.KeepBuildHistory = p.KeepBuildHistory
	}
	s.settings.AutoFixOnCrash = p.AutoFixOnCrash
	return s.save()
}

func (s *SettingsStore) Reset() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.settings = defaultSettings()
	return s.save()
}
