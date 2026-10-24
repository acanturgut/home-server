package nodestate

import (
	"bufio"
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/acanturgut/home-server/jsonfile"
)

// Sample is one point of a node's history.
type Sample struct {
	T        time.Time `json:"t"`
	CPU      float64   `json:"cpu"`
	Mem      float64   `json:"mem"`
	GPU      int       `json:"gpu,omitempty"`
	CPUTemp  int       `json:"cpu_temp,omitempty"`
	GPUTemp  int       `json:"gpu_temp,omitempty"`
	NVMeTemp int       `json:"nvme_temp,omitempty"`
	CPUW     float64   `json:"cpu_w,omitempty"`
	GPUW     float64   `json:"gpu_w,omitempty"`
}

const (
	sampleEvery = time.Minute
	// Retention is how far back a node's history goes.
	Retention = 7 * 24 * time.Hour
	// Heartbeats are unauthenticated: cap how many nodes get a history file.
	maxHistoryNodes = 16
)

// validID keeps node IDs safe to use as file names.
var validID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// History keeps one sample per minute per node: all of it in memory, and
// appended to `${DataDir}/node_history/<id>.jsonl` so it survives restarts.
//
// ponytail: whole retention in memory (≈10k samples ≈ 1 MB per node); move
// older samples to disk-only reads if nodes ever number in the dozens.
type History struct {
	dir string
	mu  sync.Mutex // guards mem and file writes
	mem map[string][]Sample
}

// NewHistory loads every node's saved samples from dataDir.
func NewHistory(dataDir string) *History {
	h := &History{dir: filepath.Join(dataDir, "node_history"), mem: map[string][]Sample{}}
	_ = os.MkdirAll(h.dir, 0o755)
	files, _ := filepath.Glob(filepath.Join(h.dir, "*.jsonl"))
	cutoff := time.Now().Add(-Retention)
	for _, f := range files {
		id := strings.TrimSuffix(filepath.Base(f), ".jsonl")
		if s := readSamples(f, cutoff); len(s) > 0 {
			h.mem[id] = s
		}
	}
	return h
}

// Record saves st as a sample unless the node was sampled under a minute ago.
func (h *History) Record(st Stats, now time.Time) {
	if !validID.MatchString(st.NodeID) {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	cur, known := h.mem[st.NodeID]
	if !known && len(h.mem) >= maxHistoryNodes {
		return
	}
	if n := len(cur); n > 0 && now.Sub(cur[n-1].T) < sampleEvery {
		return
	}
	s := Sample{T: now, CPU: st.CPUUsage, Mem: st.MemPct, GPU: st.GPUUsage,
		CPUTemp: st.CPUTemp, GPUTemp: st.GPUTemp, NVMeTemp: st.NVMeTemp,
		CPUW: st.CPUWatts, GPUW: st.GPUWatts}
	h.mem[st.NodeID] = append(cur, s)
	if f, err := os.OpenFile(h.path(st.NodeID), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644); err == nil {
		_ = json.NewEncoder(f).Encode(s)
		_ = f.Close()
	}
}

// Series returns a node's samples since `since`, oldest first.
func (h *History) Series(nodeID string, since time.Time) []Sample {
	h.mu.Lock()
	defer h.mu.Unlock()
	cur := h.mem[nodeID]
	for i, s := range cur {
		if !s.T.Before(since) {
			return append([]Sample(nil), cur[i:]...)
		}
	}
	return []Sample{}
}

// Compact drops samples older than Retention from memory and disk.
func (h *History) Compact() {
	cutoff := time.Now().Add(-Retention)
	h.mu.Lock()
	defer h.mu.Unlock()
	for id, cur := range h.mem {
		i := 0
		for i < len(cur) && cur[i].T.Before(cutoff) {
			i++
		}
		if i == 0 {
			continue
		}
		kept := append([]Sample(nil), cur[i:]...)
		h.mem[id] = kept
		var buf bytes.Buffer
		enc := json.NewEncoder(&buf)
		for _, s := range kept {
			_ = enc.Encode(s)
		}
		_ = jsonfile.Write(h.path(id), buf.Bytes())
	}
}

func (h *History) path(id string) string { return filepath.Join(h.dir, id+".jsonl") }

// readSamples reads a history file, skipping corrupt lines and old samples.
func readSamples(path string, cutoff time.Time) []Sample {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	var out []Sample
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		var s Sample
		if json.Unmarshal(sc.Bytes(), &s) == nil && s.T.After(cutoff) {
			out = append(out, s)
		}
	}
	return out
}
