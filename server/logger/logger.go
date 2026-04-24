package logger

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Entry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	RequestID string `json:"request_id,omitempty"`
	Route     string `json:"route,omitempty"`
	Model     string `json:"model,omitempty"`
	Node      string `json:"node,omitempty"`
	Tier      string `json:"tier,omitempty"`
	Latency   string `json:"latency,omitempty"`
	Message   string `json:"message"`
}

type Logger struct {
	mu      sync.Mutex
	file    *os.File
	entries []Entry
}

var instance *Logger

func Init(logDir string) error {
	os.MkdirAll(logDir, 0755)
	path := filepath.Join(logDir, time.Now().Format("2006-01-02")+".jsonl")
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	instance = &Logger{file: f}
	return nil
}

func Log(e Entry) {
	if instance == nil {
		fmt.Fprintf(os.Stderr, "[%s] %s\n", e.Level, e.Message)
		return
	}
	e.Timestamp = time.Now().UTC().Format(time.RFC3339)
	instance.mu.Lock()
	defer instance.mu.Unlock()

	instance.entries = append(instance.entries, e)
	if len(instance.entries) > 10000 {
		instance.entries = instance.entries[1:]
	}

	data, _ := json.Marshal(e)
	instance.file.Write(append(data, '\n'))

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
