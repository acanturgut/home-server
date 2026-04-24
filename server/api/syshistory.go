package api

import (
	"math"
	"net/http"
	"sync"
	"time"
)

// sysHistory collects system stats snapshots every 5 seconds, keeping the last 60
// (5 minutes of data). The frontend polls /api/system/history for chart rendering.

type sysSnapshot struct {
	Time   string  `json:"t"`
	CPU    float64 `json:"cpu"`
	Mem    float64 `json:"mem"`
	Disk   float64 `json:"disk"`
	MemMB  int     `json:"mem_mb"`
	MemMax int     `json:"mem_max"`
}

type sysHistory struct {
	mu   sync.RWMutex
	buf  []sysSnapshot
	size int
}

func newSysHistory(size int) *sysHistory {
	return &sysHistory{size: size, buf: make([]sysSnapshot, 0, size)}
}

func (h *sysHistory) push(s sysSnapshot) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.buf) >= h.size {
		h.buf = h.buf[1:]
	}
	h.buf = append(h.buf, s)
}

func (h *sysHistory) all() []sysSnapshot {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]sysSnapshot, len(h.buf))
	copy(out, h.buf)
	return out
}

// StartSysCollector begins a background goroutine that samples CPU/mem/disk every interval.
func (h *Handler) StartSysCollector(interval time.Duration, size int) {
	h.sysHist = newSysHistory(size)
	go func() {
		for {
			mem := memoryUsage()
			snap := sysSnapshot{
				Time:   time.Now().Format("15:04:05"),
				CPU:    math.Round(cpuUsage()*10) / 10,
				Mem:    math.Round(mem.UsedPct*10) / 10,
				Disk:   math.Round(diskUsage("/").UsedPct*10) / 10,
				MemMB:  mem.UsedMB,
				MemMax: mem.TotalMB,
			}
			h.sysHist.push(snap)
			time.Sleep(interval)
		}
	}()
}

// GET /api/system/history
func (h *Handler) SystemHistory(w http.ResponseWriter, r *http.Request) {
	if h.sysHist == nil {
		writeJSON(w, http.StatusOK, []sysSnapshot{})
		return
	}
	writeJSON(w, http.StatusOK, h.sysHist.all())
}
