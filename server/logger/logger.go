package logger

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Entry struct {
	Timestamp        string `json:"timestamp"`
	Level            string `json:"level"`
	RequestID        string `json:"request_id,omitempty"`
	Route            string `json:"route,omitempty"`
	Model            string `json:"model,omitempty"`
	Node             string `json:"node,omitempty"`
	Tier             string `json:"tier,omitempty"`
	Latency          string `json:"latency,omitempty"`
	PromptTokens     int    `json:"prompt_tokens,omitempty"`
	CompletionTokens int    `json:"completion_tokens,omitempty"`
	TotalTokens      int    `json:"total_tokens,omitempty"`
	Message          string `json:"message"`
}

type Logger struct {
	mu      sync.Mutex
	dir     string
	day     string // date of the open file; a new file starts each day
	file    *os.File
	entries []Entry
}

var instance *Logger

// maxBuffered caps the in-memory ring buffer used by /api/logs. The on-disk
// JSONL file is the source of truth; this just bounds RAM/response size.
const maxBuffered = 10000

func Init(logDir string) error {
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return err
	}
	day := time.Now().Format(time.DateOnly)
	path := filepath.Join(logDir, day+".jsonl")
	// Hydrate today's entries from disk so the dashboard's "AI Activity"
	// (token usage, latency timeline, model leaderboard, errors) survives a
	// container restart / redeploy. Without this, every redeploy wipes the
	// in-memory buffer and the panels go empty until new traffic flows.
	var preloaded []Entry
	if data, err := os.ReadFile(path); err == nil && len(data) > 0 {
		for _, line := range bytes.Split(data, []byte("\n")) {
			if len(line) == 0 {
				continue
			}
			var e Entry
			if json.Unmarshal(line, &e) == nil {
				preloaded = append(preloaded, e)
			}
		}
		if len(preloaded) > maxBuffered {
			preloaded = preloaded[len(preloaded)-maxBuffered:]
		}
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	instance = &Logger{dir: logDir, day: day, file: f, entries: preloaded}
	return nil
}

// rotateLocked switches to a new day's file after midnight.
func (l *Logger) rotateLocked(now time.Time) {
	day := now.Format(time.DateOnly)
	if day == l.day {
		return
	}
	f, err := os.OpenFile(filepath.Join(l.dir, day+".jsonl"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return // keep writing to the old file
	}
	l.file.Close()
	l.file, l.day = f, day
}

func Log(e Entry) {
	if instance == nil {
		fmt.Fprintf(os.Stderr, "[%s] %s\n", e.Level, e.Message)
		return
	}
	now := time.Now()
	e.Timestamp = now.UTC().Format(time.RFC3339)
	instance.mu.Lock()
	defer instance.mu.Unlock()
	instance.rotateLocked(now)

	instance.entries = append(instance.entries, e)
	if len(instance.entries) > maxBuffered {
		instance.entries = instance.entries[1:]
	}

	data, _ := json.Marshal(e)
	_, _ = instance.file.Write(append(data, '\n'))

	fmt.Fprintf(os.Stderr, "[%s] %s %s\n", e.Level, e.Message, e.Latency)
}

func Info(msg string)  { Log(Entry{Level: "INFO", Message: msg}) }
func Error(msg string) { Log(Entry{Level: "ERROR", Message: msg}) }

func Recent(n int) []Entry {
	if instance == nil {
		return nil
	}
	instance.mu.Lock()
	defer instance.mu.Unlock()

	if n > len(instance.entries) {
		n = len(instance.entries)
	}
	result := make([]Entry, n)
	copy(result, instance.entries[len(instance.entries)-n:])
	return result
}
