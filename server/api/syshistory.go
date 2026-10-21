package api

import (
	"context"
	"math"
	"net/http"
	"sync"
	"time"
)

// sysHistory keeps the most recent system stats samples (60 × 5s = 5 min)
// for the /api/system/history chart.

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

// latestCPU is the most recent CPU sample, so /api/system needn't sample.
func (h *sysHistory) latestCPU() float64 {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if len(h.buf) == 0 {
		return 0
	}
	return h.buf[len(h.buf)-1].CPU
}

func (h *sysHistory) all() []sysSnapshot {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]sysSnapshot, len(h.buf))
	copy(out, h.buf)
	return out
}

// RunSysCollector samples CPU/mem/disk every interval until ctx ends.
func (h *Handler) RunSysCollector(ctx context.Context, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		mem := memoryUsage()
		h.sysHist.push(sysSnapshot{
			Time:   time.Now().Format("15:04:05"),
			CPU:    math.Round(cpuUsage()*10) / 10,
			Mem:    math.Round(mem.UsedPct*10) / 10,
			Disk:   math.Round(diskUsage("/").UsedPct*10) / 10,
			MemMB:  mem.UsedMB,
			MemMax: mem.TotalMB,
		})
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// GET /api/system/history
func (h *Handler) SystemHistory(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.sysHist.all())
}
