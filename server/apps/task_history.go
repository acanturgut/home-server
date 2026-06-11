package apps

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// TaskRun is one completed agent run (build / rebuild / fix). The events
// slice is the cleaned-up stream so the UI can replay it later as task
// history.
type TaskRun struct {
	ID        string          `json:"id"`
	AppName   string          `json:"app_name"`
	Kind      string          `json:"kind"` // "build" | "rebuild" | "fix"
	Prompt    string          `json:"prompt,omitempty"`
	StartedAt time.Time       `json:"started_at"`
	EndedAt   time.Time       `json:"ended_at"`
	Success   bool            `json:"success"`
	Error     string          `json:"error,omitempty"`
	Events    []PipelineEvent `json:"events"`
}

// TaskHistory persists the last N runs per app to disk so users can
// review what the agent did across sessions.
type TaskHistory struct {
	mu       sync.RWMutex
	path     string
	perApp   int
	byApp    map[string][]TaskRun
}

const defaultHistoryPerApp = 25

func NewTaskHistory(dataDir string) *TaskHistory {
	h := &TaskHistory{
		path:   filepath.Join(dataDir, "task_history.json"),
		perApp: defaultHistoryPerApp,
		byApp:  map[string][]TaskRun{},
	}
	h.load()
	return h
}

func (h *TaskHistory) load() {
	data, err := os.ReadFile(h.path)
	if err != nil {
		return
	}
	_ = json.Unmarshal(data, &h.byApp)
}

func (h *TaskHistory) saveLocked() {
	data, err := json.MarshalIndent(h.byApp, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(h.path, data, 0644)
}

// Append stores a completed run, evicting the oldest if we're past the cap.
func (h *TaskHistory) Append(run TaskRun) {
	if run.AppName == "" {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	lst := h.byApp[run.AppName]
	lst = append(lst, run)
	if len(lst) > h.perApp {
		lst = lst[len(lst)-h.perApp:]
	}
	h.byApp[run.AppName] = lst
	h.saveLocked()
}

// List returns runs for an app, newest first.
func (h *TaskHistory) List(app string) []TaskRun {
	h.mu.RLock()
	defer h.mu.RUnlock()
	src := h.byApp[app]
	out := make([]TaskRun, len(src))
	copy(out, src)
	sort.Slice(out, func(i, j int) bool {
		return out[i].StartedAt.After(out[j].StartedAt)
	})
	return out
}
