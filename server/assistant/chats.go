package assistant

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// ── Chat sessions store ──────────────────────────────────────────────────

// ChatStore persists chat sessions as raw JSON. The structure of a session is
// owned by the frontend; the backend only round-trips the bytes so we don't
// have to keep schemas in sync.
type ChatStore struct {
	mu   sync.RWMutex
	path string
	raw  []byte // json array
}

func NewChatStore(dataDir string) *ChatStore {
	_ = os.MkdirAll(dataDir, 0o755)
	c := &ChatStore{path: filepath.Join(dataDir, "chats.json"), raw: []byte("[]")}
	c.load()
	return c
}

func (c *ChatStore) load() {
	data, err := os.ReadFile(c.path)
	if err != nil || len(data) == 0 {
		return
	}
	var probe any
	if json.Unmarshal(data, &probe) != nil {
		return
	}
	c.raw = data
}

// Get returns the raw JSON array of sessions.
func (c *ChatStore) Get() []byte {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]byte, len(c.raw))
	copy(out, c.raw)
	return out
}

// Set replaces the stored sessions with the given JSON array.
func (c *ChatStore) Set(raw []byte) error {
	if len(raw) == 0 {
		raw = []byte("[]")
	}
	var probe []any
	if err := json.Unmarshal(raw, &probe); err != nil {
		return errors.New("expected JSON array of sessions")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.raw = raw
	return os.WriteFile(c.path, raw, 0o644)
}

// ── Snippets store (saved chat replies, prompts, etc.) ───────────────────

type Snippet struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	Kind      string `json:"kind,omitempty"` // "prompt" | "reply" | "code" | ""
	CreatedAt int64  `json:"createdAt"`
}

type SnippetStore struct {
	mu   sync.RWMutex
	path string
	list []Snippet
}

func NewSnippetStore(dataDir string) *SnippetStore {
	_ = os.MkdirAll(dataDir, 0o755)
	s := &SnippetStore{path: filepath.Join(dataDir, "snippets.json"), list: []Snippet{}}
	s.load()
	return s
}

func (s *SnippetStore) load() {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return
	}
	var arr []Snippet
	if json.Unmarshal(data, &arr) != nil {
		return
	}
	s.list = arr
}

func (s *SnippetStore) save() error {
	data, err := json.MarshalIndent(s.list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0o644)
}

func (s *SnippetStore) All() []Snippet {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Snippet, len(s.list))
	copy(out, s.list)
	return out
}

func (s *SnippetStore) Add(sn Snippet) (Snippet, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if sn.ID == "" {
		sn.ID = time.Now().UTC().Format("20060102T150405.000000000")
	}
	if sn.CreatedAt == 0 {
		sn.CreatedAt = time.Now().UnixMilli()
	}
	s.list = append([]Snippet{sn}, s.list...)
	if err := s.save(); err != nil {
		return Snippet{}, err
	}
	return sn, nil
}

func (s *SnippetStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.list[:0]
	for _, sn := range s.list {
		if sn.ID != id {
			out = append(out, sn)
		}
	}
	s.list = out
	return s.save()
}
