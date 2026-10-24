package nodestate

import (
	"sync"
	"time"
)

// Stats holds the latest telemetry from a node agent.
type Stats struct {
	NodeID      string    `json:"node_id"`
	Hostname    string    `json:"hostname"`
	OS          string    `json:"os"`
	Arch        string    `json:"arch"`
	CPUModel    string    `json:"cpu_model"`
	CPUCores    int       `json:"cpu_cores"`
	CPUUsage    float64   `json:"cpu_usage"`
	MemTotalGB  float64   `json:"mem_total_gb"`
	MemUsedGB   float64   `json:"mem_used_gb"`
	MemPct      float64   `json:"mem_pct"`
	DiskTotalGB float64   `json:"disk_total_gb"`
	DiskUsedGB  float64   `json:"disk_used_gb"`
	DiskPct     float64   `json:"disk_pct"`
	GPUName     string    `json:"gpu_name,omitempty"`
	GPUUsage    int       `json:"gpu_usage,omitempty"`
	GPUMemTotal int       `json:"gpu_mem_total_mb,omitempty"`
	GPUMemUsed  int       `json:"gpu_mem_used_mb,omitempty"`
	GPUTemp     int       `json:"gpu_temp,omitempty"`
	CPUTemp     int       `json:"cpu_temp,omitempty"`
	NVMeTemp    int       `json:"nvme_temp,omitempty"`
	UptimeSecs  int64     `json:"uptime_secs"`
	LastSeen    time.Time `json:"last_seen"`
	// Logs arrive with a heartbeat and move to the store's log buffer.
	Logs []string `json:"logs,omitempty"`
}

// Store keeps per-node stats and a command queue.
type Store struct {
	mu       sync.RWMutex
	stats    map[string]*Stats
	commands map[string][]string
	logs     map[string][]string
}

func NewStore() *Store {
	return &Store{
		stats:    make(map[string]*Stats),
		commands: make(map[string][]string),
		logs:     make(map[string][]string),
	}
}

// staleAfter is how long an agent may stay silent before it is forgotten.
// It also bounds the maps, since heartbeats are unauthenticated.
const staleAfter = 10 * time.Minute

// Heartbeats are unauthenticated, so log input is capped per heartbeat, per
// line and per node.
const (
	maxLogsPerBeat = 50
	maxLogLineLen  = 500
	keepLogs       = 200
)

// Update stores the latest stats and returns any pending commands for the node.
func (s *Store) Update(st Stats) []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	for id, old := range s.stats {
		if now.Sub(old.LastSeen) > staleAfter {
			delete(s.stats, id)
			delete(s.commands, id)
			delete(s.logs, id)
		}
	}
	if n := len(st.Logs); n > 0 {
		lines := st.Logs[max(0, n-maxLogsPerBeat):]
		for i, l := range lines {
			if len(l) > maxLogLineLen {
				lines[i] = l[:maxLogLineLen]
			}
		}
		all := append(s.logs[st.NodeID], lines...)
		s.logs[st.NodeID] = all[max(0, len(all)-keepLogs):]
	}
	st.Logs = nil
	st.LastSeen = now
	s.stats[st.NodeID] = &st
	cmds := s.commands[st.NodeID]
	delete(s.commands, st.NodeID)
	return cmds
}

// All returns a snapshot of all node stats.
func (s *Store) All() map[string]*Stats {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[string]*Stats, len(s.stats))
	for k, v := range s.stats {
		cp := *v
		out[k] = &cp
	}
	return out
}

// Enqueue adds a command to the node's pending queue.
func (s *Store) Enqueue(nodeID, command string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.commands[nodeID] = append(s.commands[nodeID], command)
}

// IsOnline returns true if the node has sent a heartbeat within the last 30s.
func (s *Store) IsOnline(nodeID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	st, ok := s.stats[nodeID]
	if !ok {
		return false
	}
	return time.Since(st.LastSeen) < 30*time.Second
}

// Logs returns a node's most recent warning and error lines, oldest first.
func (s *Store) Logs(nodeID string) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]string(nil), s.logs[nodeID]...)
}
