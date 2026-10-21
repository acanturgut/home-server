package config

import (
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/acanturgut/home-server/jsonfile"
	"github.com/acanturgut/home-server/logger"
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
	Temperature *float64 `json:"temperature,omitempty"`
}

type Config struct {
	Port       string `json:"port"`
	OllamaHost string `json:"ollama_host"`
	// RouterModel is the env default for the intent classifier; the runtime
	// value lives in assistant.Settings so it can change without a restart.
	RouterModel string `json:"router_model"`
	LogDir      string `json:"log_dir"`
	DataDir     string `json:"data_dir"`
	HomeKitPIN  string `json:"homekit_pin"`
}

var (
	cfg  *Config
	once sync.Once
)

func Load() *Config {
	once.Do(func() {
		cfg = &Config{
			Port:        getEnv("PORT", "8080"),
			OllamaHost:  getEnv("OLLAMA_HOST", "http://localhost:11434"),
			RouterModel: getEnv("ROUTER_MODEL", "gemma3:1b"),
			LogDir:      getEnv("LOG_DIR", "/var/log/home-server"),
			DataDir:     getEnv("DATA_DIR", "/var/lib/home-server"),
			HomeKitPIN:  getEnv("HOMEKIT_PIN", "00102003"),
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
	s := &NodeStore{path: filepath.Join(dataDir, "nodes.json"), nodes: []Node{}}
	if err := jsonfile.Load(s.path, &s.nodes); err != nil {
		logger.Error("nodes: " + err.Error())
	}
	return s
}

func (s *NodeStore) save() error { return jsonfile.Save(s.path, s.nodes) }

func (s *NodeStore) All() []Node {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Node, len(s.nodes))
	copy(out, s.nodes)
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

// ByHost finds the node whose Host (a URL like http://10.0.0.5:1234, or a
// bare host[:port]) points at exactly the given IP or hostname.
func (s *NodeStore) ByHost(host string) (Node, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, n := range s.nodes {
		if hostname(n.Host) == host {
			return n, true
		}
	}
	return Node{}, false
}

func hostname(hostport string) string {
	if strings.Contains(hostport, "://") {
		if u, err := url.Parse(hostport); err == nil {
			return u.Hostname()
		}
	}
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		return h
	}
	return strings.Trim(hostport, "[]")
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
