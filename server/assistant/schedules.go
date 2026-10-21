package assistant

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ── Scheduled prompts ────────────────────────────────────────────────────
//
// A Schedule describes a prompt that should be executed periodically and the
// reply recorded in a chat session (created if needed).  Cron here is a very
// small subset: "@every <dur>" or "<minute> <hour> * * *" (daily) or
// "<minute> * * * *" (hourly).  Anything else is treated as @every.

type Schedule struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Prompt      string  `json:"prompt"`
	Cron        string  `json:"cron"`                  // e.g. "@every 1h", "0 9 * * *"
	Route       string  `json:"route,omitempty"`       // "" | "auto" | "light" | "heavy" | <node>
	Temperature float64 `json:"temperature,omitempty"` // 0 = unset
	Enabled     bool    `json:"enabled"`
	LastRun     int64   `json:"lastRun,omitempty"` // unix ms
	NextRun     int64   `json:"nextRun,omitempty"` // unix ms
	LastResult  string  `json:"lastResult,omitempty"`
	LastError   string  `json:"lastError,omitempty"`
	SessionID   string  `json:"sessionId,omitempty"` // chat session to append runs to
}

type ScheduleStore struct {
	mu   sync.RWMutex
	path string
	list []Schedule
}

func NewScheduleStore(dataDir string) *ScheduleStore {
	_ = os.MkdirAll(dataDir, 0o755)
	s := &ScheduleStore{path: filepath.Join(dataDir, "schedules.json"), list: []Schedule{}}
	s.load()
	return s
}

func (s *ScheduleStore) load() {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return
	}
	var arr []Schedule
	if json.Unmarshal(data, &arr) != nil {
		return
	}
	s.list = arr
}

func (s *ScheduleStore) save() error {
	data, err := json.MarshalIndent(s.list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0o644)
}

func (s *ScheduleStore) All() []Schedule {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Schedule, len(s.list))
	copy(out, s.list)
	return out
}

func (s *ScheduleStore) Get(id string) (Schedule, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, sc := range s.list {
		if sc.ID == id {
			return sc, true
		}
	}
	return Schedule{}, false
}

func (s *ScheduleStore) Upsert(sc Schedule) (Schedule, error) {
	if strings.TrimSpace(sc.Prompt) == "" {
		return Schedule{}, errors.New("prompt required")
	}
	if strings.TrimSpace(sc.Cron) == "" {
		return Schedule{}, errors.New("cron required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if sc.ID == "" {
		sc.ID = time.Now().UTC().Format("20060102T150405.000000000")
	}
	if sc.Title == "" {
		t := strings.TrimSpace(sc.Prompt)
		if len(t) > 40 {
			t = t[:40] + "…"
		}
		sc.Title = t
	}
	sc.NextRun = nextRun(sc.Cron, time.Now()).UnixMilli()
	replaced := false
	for i, ex := range s.list {
		if ex.ID == sc.ID {
			// preserve run history fields unless caller explicitly sets them
			if sc.LastRun == 0 {
				sc.LastRun = ex.LastRun
			}
			if sc.LastResult == "" {
				sc.LastResult = ex.LastResult
			}
			if sc.LastError == "" {
				sc.LastError = ex.LastError
			}
			if sc.SessionID == "" {
				sc.SessionID = ex.SessionID
			}
			s.list[i] = sc
			replaced = true
			break
		}
	}
	if !replaced {
		s.list = append(s.list, sc)
	}
	sort.Slice(s.list, func(i, j int) bool { return s.list[i].NextRun < s.list[j].NextRun })
	if err := s.save(); err != nil {
		return Schedule{}, err
	}
	return sc, nil
}

func (s *ScheduleStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.list[:0]
	for _, sc := range s.list {
		if sc.ID != id {
			out = append(out, sc)
		}
	}
	s.list = out
	return s.save()
}

// RecordRun writes the latest execution result back to the store.
func (s *ScheduleStore) RecordRun(id string, result string, runErr error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, sc := range s.list {
		if sc.ID != id {
			continue
		}
		now := time.Now()
		sc.LastRun = now.UnixMilli()
		sc.NextRun = nextRun(sc.Cron, now).UnixMilli()
		if runErr != nil {
			sc.LastError = runErr.Error()
			sc.LastResult = ""
		} else {
			sc.LastError = ""
			sc.LastResult = result
		}
		s.list[i] = sc
		break
	}
	_ = s.save()
}

// Due returns the schedules that are due to run at t (Enabled && NextRun <= t).
func (s *ScheduleStore) Due(t time.Time) []Schedule {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := []Schedule{}
	tm := t.UnixMilli()
	for _, sc := range s.list {
		if !sc.Enabled {
			continue
		}
		if sc.NextRun == 0 || sc.NextRun <= tm {
			out = append(out, sc)
		}
	}
	return out
}

// ── Cron parsing (minimal) ───────────────────────────────────────────────

// nextRun returns the next time `expr` should fire after `from`.  Supported:
//
//	@every <duration>      e.g. "@every 30m", "@every 2h"
//	M H * * *              daily at H:M
//	M * * * *              hourly at minute M
//
// Anything else → default to 1 hour from now (so misconfigured schedules
// don't hammer the server).
func nextRun(expr string, from time.Time) time.Time {
	expr = strings.TrimSpace(expr)
	if strings.HasPrefix(expr, "@every ") {
		if d, err := time.ParseDuration(strings.TrimPrefix(expr, "@every ")); err == nil && d >= time.Minute {
			return from.Add(d)
		}
	}
	parts := strings.Fields(expr)
	if len(parts) == 5 {
		minStr, hourStr, dom, mon, dow := parts[0], parts[1], parts[2], parts[3], parts[4]
		if dom == "*" && mon == "*" && dow == "*" {
			if hourStr == "*" {
				if m, err := strconv.Atoi(minStr); err == nil && m >= 0 && m < 60 {
					next := time.Date(from.Year(), from.Month(), from.Day(), from.Hour(), m, 0, 0, from.Location())
					if !next.After(from) {
						next = next.Add(time.Hour)
					}
					return next
				}
			} else {
				m, mErr := strconv.Atoi(minStr)
				h, hErr := strconv.Atoi(hourStr)
				if mErr == nil && hErr == nil && m >= 0 && m < 60 && h >= 0 && h < 24 {
					next := time.Date(from.Year(), from.Month(), from.Day(), h, m, 0, 0, from.Location())
					if !next.After(from) {
						next = next.Add(24 * time.Hour)
					}
					return next
				}
			}
		}
	}
	return from.Add(1 * time.Hour)
}
