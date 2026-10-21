package homedevices

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/acanturgut/home-server/jsonfile"
)

// SensorSample is one point of sensor history.
//
// Pointer fields stay nil when the sensor doesn't expose that metric, so the
// frontend can tell the difference between "0 PM2.5" and "no PM2.5 data".
type SensorSample struct {
	T        time.Time `json:"t"`
	Temp     *float64  `json:"temp,omitempty"`
	Humidity *int      `json:"humidity,omitempty"`
	PM25     *int      `json:"pm25,omitempty"`
	VOC      *int      `json:"voc,omitempty"`
	Battery  *int      `json:"battery,omitempty"`
}

// HistoryStore is a simple time-series store for sensor readings.
//
// Strategy:
//   - Each device's samples live in `${DataDir}/sensor_history/<safeID>.jsonl`,
//     append-only, one JSON object per line. Cheap to write, easy to inspect.
//   - In-memory ring keeps the last `maxInMemory` samples per device for fast
//     queries; older history reads from disk on demand.
//   - We only persist a sample at most every `minInterval` (default 5min) to
//     keep the file small (≈ 12 samples/hour × 24h × 14d ≈ 4k samples ≈ 400KB).
//   - Periodic `Compact` rewrites each file dropping anything older than
//     `retention` (default 30 days).
type HistoryStore struct {
	dir         string
	fileMu      sync.Mutex // serializes appends with Compact's rewrites
	mu          sync.RWMutex
	mem         map[string][]SensorSample // deviceID → recent samples
	lastWrite   map[string]time.Time
	maxInMemory int
	minInterval time.Duration
	retention   time.Duration
}

// NewHistoryStore creates the directory and lazily warms each device's
// in-memory buffer the first time it is queried.
func NewHistoryStore(dataDir string) *HistoryStore {
	dir := filepath.Join(dataDir, "sensor_history")
	_ = os.MkdirAll(dir, 0o755)
	return &HistoryStore{
		dir:         dir,
		mem:         map[string][]SensorSample{},
		lastWrite:   map[string]time.Time{},
		maxInMemory: 4096,
		minInterval: 5 * time.Minute,
		retention:   30 * 24 * time.Hour,
	}
}

// Record persists the relevant sensor metrics from a Device snapshot.
// Returns true if the sample was actually written to disk.
//
// Non-sensor devices and sensors with no readings at all are ignored.
func (h *HistoryStore) Record(d Device, now time.Time) bool {
	if d.Type != TypeSensor {
		return false
	}
	if d.Temp == nil && d.Humidity == nil && d.PM25 == nil && d.VOC == nil && d.Battery == nil {
		return false
	}

	h.mu.Lock()
	last, ok := h.lastWrite[d.ID]
	if ok && now.Sub(last) < h.minInterval {
		h.mu.Unlock()
		return false
	}
	sample := SensorSample{
		T:        now,
		Temp:     d.Temp,
		Humidity: d.Humidity,
		PM25:     d.PM25,
		VOC:      d.VOC,
		Battery:  d.Battery,
	}
	// Append to in-memory ring (warming from disk on first write).
	cur := h.mem[d.ID]
	if cur == nil {
		cur = h.loadTailLocked(d.ID)
	}
	cur = append(cur, sample)
	if len(cur) > h.maxInMemory {
		cur = cur[len(cur)-h.maxInMemory:]
	}
	h.mem[d.ID] = cur
	h.lastWrite[d.ID] = now
	h.mu.Unlock()

	// File append outside mu — slow disk shouldn't block queries.
	h.fileMu.Lock()
	_ = h.appendToFile(d.ID, sample)
	h.fileMu.Unlock()
	return true
}

// Series returns samples for the given device since `since`. If the in-memory
// ring covers the whole range we use it directly; otherwise we read the file.
func (h *HistoryStore) Series(deviceID string, since time.Time) []SensorSample {
	h.mu.Lock()
	cur, ok := h.mem[deviceID]
	if !ok {
		cur = h.loadTailLocked(deviceID)
		h.mem[deviceID] = cur
	}
	memCopy := make([]SensorSample, len(cur))
	copy(memCopy, cur)
	h.mu.Unlock()

	if len(memCopy) > 0 && !memCopy[0].T.After(since) {
		return filterSince(memCopy, since)
	}

	all, err := h.readAll(deviceID)
	if err != nil || len(all) == 0 {
		return filterSince(memCopy, since)
	}
	return filterSince(all, since)
}

// Compact rewrites every per-device file dropping samples older than the
// retention window. Safe to call from a periodic ticker.
func (h *HistoryStore) Compact() {
	cutoff := time.Now().Add(-h.retention)
	entries, err := os.ReadDir(h.dir)
	if err != nil {
		return
	}
	for _, ent := range entries {
		if !ent.IsDir() && strings.HasSuffix(ent.Name(), ".jsonl") {
			h.compactFile(filepath.Join(h.dir, ent.Name()), cutoff)
		}
	}
}

func (h *HistoryStore) compactFile(path string, cutoff time.Time) {
	h.fileMu.Lock()
	defer h.fileMu.Unlock()
	samples, err := readAllFile(path)
	if err != nil {
		return
	}
	kept := samples[:0]
	for _, s := range samples {
		if s.T.After(cutoff) {
			kept = append(kept, s)
		}
	}
	if len(kept) == len(samples) {
		return
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	for _, s := range kept {
		_ = enc.Encode(s)
	}
	_ = jsonfile.Write(path, buf.Bytes())
}

// ---- internal -----------------------------------------------------------

func (h *HistoryStore) filePath(deviceID string) string {
	return filepath.Join(h.dir, safeFileName(deviceID)+".jsonl")
}

func (h *HistoryStore) loadTailLocked(deviceID string) []SensorSample {
	all, err := h.readAll(deviceID)
	if err != nil || len(all) == 0 {
		return nil
	}
	if len(all) <= h.maxInMemory {
		return all
	}
	return all[len(all)-h.maxInMemory:]
}

func (h *HistoryStore) appendToFile(deviceID string, s SensorSample) error {
	f, err := os.OpenFile(h.filePath(deviceID), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	return enc.Encode(s)
}

func (h *HistoryStore) readAll(deviceID string) ([]SensorSample, error) {
	return readAllFile(h.filePath(deviceID))
}

func readAllFile(path string) ([]SensorSample, error) {
	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	defer f.Close()
	out := make([]SensorSample, 0, 256)
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		var s SensorSample
		if err := json.Unmarshal(scanner.Bytes(), &s); err != nil {
			continue // tolerate corrupt lines
		}
		out = append(out, s)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].T.Before(out[j].T) })
	return out, nil
}

func filterSince(samples []SensorSample, since time.Time) []SensorSample {
	if since.IsZero() {
		return samples
	}
	// Samples are stored in chronological order; binary search would be nice
	// but linear is plenty fast for our sizes.
	for i, s := range samples {
		if !s.T.Before(since) {
			return samples[i:]
		}
	}
	return nil
}

// safeFileName escapes characters that aren't safe in filenames on macOS/Linux.
// Device IDs include ":" (bridgeID:localID) and possibly "/" so we replace
// both. We *don't* base64-encode because that produces ugly filenames.
func safeFileName(id string) string {
	out := strings.ReplaceAll(id, ":", "_")
	out = strings.ReplaceAll(out, "/", "_")
	out = strings.ReplaceAll(out, "\\", "_")
	return out
}
