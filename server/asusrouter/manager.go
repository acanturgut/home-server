package asusrouter

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Manager owns the persisted Config + an active Client and caches the most
// recent Status. Safe for concurrent use.
type Manager struct {
	mu     sync.RWMutex
	path   string
	cfg    Config
	client *Client

	cache    Status
	cacheAt  time.Time
	cacheTTL time.Duration

	clientsCache []RouterClient
	clientsAt    time.Time
}

// NewManager loads any persisted config from dataDir and returns a Manager.
// If no config has been saved yet, the returned manager is "unconfigured" —
// every read call returns ErrNotConfigured.
func NewManager(dataDir string) *Manager {
	_ = os.MkdirAll(dataDir, 0755)
	m := &Manager{
		path:     filepath.Join(dataDir, "asusrouter.json"),
		cacheTTL: 15 * time.Second,
	}
	m.load()
	return m
}

// ErrNotConfigured is returned when no router credentials have been stored.
var ErrNotConfigured = errors.New("asusrouter: not configured")

func (m *Manager) load() {
	data, err := os.ReadFile(m.path)
	if err != nil {
		return
	}
	var cfg Config
	if json.Unmarshal(data, &cfg) != nil {
		return
	}
	m.cfg = cfg
	if cfg.Host != "" && cfg.Username != "" {
		m.client = New(cfg)
	}
}

func (m *Manager) save() error {
	data, err := json.MarshalIndent(m.cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(m.path, data, 0600)
}

// Configured reports whether credentials are stored.
func (m *Manager) Configured() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.cfg.Host != "" && m.cfg.Username != ""
}

// Config returns a redacted copy of the stored config (password blanked).
func (m *Manager) RedactedConfig() Config {
	m.mu.RLock()
	defer m.mu.RUnlock()
	c := m.cfg
	if c.Password != "" {
		c.Password = "********"
	}
	return c
}

// HasPassword returns true if a non-empty password is stored.
func (m *Manager) HasPassword() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.cfg.Password != ""
}

// SetConfig replaces the config and resets the cached client. If the new
// password field is empty, the previous one is preserved (so the UI doesn't
// have to re-send it on every save).
func (m *Manager) SetConfig(c Config) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if c.Password == "" || c.Password == "********" {
		c.Password = m.cfg.Password
	}
	m.cfg = c
	m.cache = Status{}
	m.cacheAt = time.Time{}
	m.clientsCache = nil
	m.clientsAt = time.Time{}
	if c.Host != "" && c.Username != "" {
		m.client = New(c)
	} else {
		m.client = nil
	}
	return m.save()
}

// Test verifies the stored config by performing a fresh login.
func (m *Manager) Test(ctx context.Context) error {
	m.mu.RLock()
	cli := m.client
	m.mu.RUnlock()
	if cli == nil {
		return ErrNotConfigured
	}
	return cli.Login(ctx)
}

// Status returns the cached status, refreshing it if older than cacheTTL.
func (m *Manager) Status(ctx context.Context) (Status, error) {
	m.mu.RLock()
	cli := m.client
	if !m.cacheAt.IsZero() && time.Since(m.cacheAt) < m.cacheTTL {
		s := m.cache
		m.mu.RUnlock()
		return s, nil
	}
	m.mu.RUnlock()
	if cli == nil {
		return Status{}, ErrNotConfigured
	}
	s, err := cli.Status(ctx)
	if err != nil {
		return Status{}, err
	}
	m.mu.Lock()
	m.cache = s
	m.cacheAt = time.Now()
	m.mu.Unlock()
	return s, nil
}

// Clients returns the cached connected-client list (TTL same as status).
func (m *Manager) Clients(ctx context.Context) ([]RouterClient, error) {
	m.mu.RLock()
	cli := m.client
	if !m.clientsAt.IsZero() && time.Since(m.clientsAt) < m.cacheTTL {
		out := append([]RouterClient(nil), m.clientsCache...)
		m.mu.RUnlock()
		return out, nil
	}
	m.mu.RUnlock()
	if cli == nil {
		return nil, ErrNotConfigured
	}
	cs, err := cli.Clients(ctx)
	if err != nil {
		return nil, err
	}
	m.mu.Lock()
	m.clientsCache = cs
	m.clientsAt = time.Now()
	m.mu.Unlock()
	return cs, nil
}

// Reboot proxies to the underlying client.
func (m *Manager) Reboot(ctx context.Context) error {
	cli, err := m.requireClient()
	if err != nil {
		return err
	}
	return cli.Reboot(ctx)
}

// RestartWireless proxies to the underlying client.
func (m *Manager) RestartWireless(ctx context.Context) error {
	cli, err := m.requireClient()
	if err != nil {
		return err
	}
	return cli.RestartWireless(ctx)
}

// WakeOnLAN proxies to the underlying client.
func (m *Manager) WakeOnLAN(ctx context.Context, mac string) error {
	cli, err := m.requireClient()
	if err != nil {
		return err
	}
	return cli.WakeOnLAN(ctx, mac)
}

// BlockedMACs returns the set of MACs currently blocked by the router's
// parental-control MAC filter.
func (m *Manager) BlockedMACs(ctx context.Context) (map[string]bool, error) {
	cli, err := m.requireClient()
	if err != nil {
		return nil, err
	}
	return cli.BlockedMACs(ctx)
}

// SetBlocked toggles internet-block state for `mac` via the router.
func (m *Manager) SetBlocked(ctx context.Context, mac, name string, blocked bool) error {
	cli, err := m.requireClient()
	if err != nil {
		return err
	}
	if err := cli.SetBlocked(ctx, mac, name, blocked); err != nil {
		return err
	}
	// Bust the clients cache so the UI reflects the new state on next poll.
	m.mu.Lock()
	m.clientsAt = time.Time{}
	m.mu.Unlock()
	return nil
}

func (m *Manager) requireClient() (*Client, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.client == nil {
		return nil, ErrNotConfigured
	}
	return m.client, nil
}
