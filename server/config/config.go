package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type Tier string

const (
	TierHighEnd Tier = "high-end"
	TierLowEnd  Tier = "low-end"
)

type Node struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Host        string   `json:"host"`
	Tier        Tier     `json:"tier"`
	GPU         string   `json:"gpu,omitempty"`
	MAC         string   `json:"mac,omitempty"`
	Model       string   `json:"model,omitempty"`
	SSHUser     string   `json:"ssh_user,omitempty"`
	SSHPass     string   `json:"ssh_pass,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
}

type Config struct {
	Port         string `json:"port"`
	OllamaHost   string `json:"ollama_host"`
	RouterModel  string `json:"router_model"`
	LogDir       string `json:"log_dir"`
	DataDir      string `json:"data_dir"`
	HomeKitPIN   string `json:"homekit_pin"`
	AnthropicKey string `json:"-"`
}

var (
	cfg  *Config
	once sync.Once
)

func Load() *Config {
	once.Do(func() {
		cfg = &Config{
			Port:         getEnv("PORT", "8080"),
			OllamaHost:   getEnv("OLLAMA_HOST", "http://localhost:11434"),
			RouterModel:  getEnv("ROUTER_MODEL", "gemma3:1b"),
			LogDir:       getEnv("LOG_DIR", "/var/log/home-server"),
			DataDir:      getEnv("DATA_DIR", "/var/lib/home-server"),
			HomeKitPIN:   getEnv("HOMEKIT_PIN", "00102003"),
			AnthropicKey: getEnv("ANTHROPIC_API_KEY", ""),
		}
	})
	return cfg
}

type NodeStore struct {
	mu    sync.RWMutex
	nodes []Node
	path  string
}

func NewNodeStore(dataDir string) *NodeStore {
	os.MkdirAll(dataDir, 0755)
	s := &NodeStore{path: filepath.Join(dataDir, "nodes.json")}
	s.load()
	return s
}

func (s *NodeStore) load() {
	data, err := os.ReadFile(s.path)
	if err != nil {
		s.nodes = []Node{}
		return
	}
	json.Unmarshal(data, &s.nodes)
}

func (s *NodeStore) save() error {
	data, err := json.MarshalIndent(s.nodes, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0644)
}

func (s *NodeStore) All() []Node {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Node, len(s.nodes))
	copy(out, s.nodes)
	return out
}

func (s *NodeStore) ByTier(tier Tier) []Node {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []Node
	for _, n := range s.nodes {
		if n.Tier == tier {
			out = append(out, n)
		}
	}
	return out
}

func (s *NodeStore) Get(id string) (Node, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, n := range s.nodes {
		if n.ID == id {
			return n, true
		}
	}
	return Node{}, false
}

// ByHost finds a node whose Host field contains the given IP or hostname.
func (s *NodeStore) ByHost(ip string) (Node, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, n := range s.nodes {
		if n.Host != "" && strings.Contains(n.Host, ip) {
			return n, true
		}
	}
	return Node{}, false
}

func (s *NodeStore) Add(n Node) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, existing := range s.nodes {
		if existing.ID == n.ID {
			return os.ErrExist
		}
	}
	s.nodes = append(s.nodes, n)
	return s.save()
}

func (s *NodeStore) Update(n Node) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, existing := range s.nodes {
		if existing.ID == n.ID {
			s.nodes[i] = n
			return s.save()
		}
	}
	return os.ErrNotExist
}

func (s *NodeStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, n := range s.nodes {
		if n.ID == id {
			s.nodes = append(s.nodes[:i], s.nodes[i+1:]...)
			return s.save()
		}
	}
	return os.ErrNotExist
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
