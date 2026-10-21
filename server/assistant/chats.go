package assistant

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"sync"

	"github.com/acanturgut/home-server/jsonfile"
	"github.com/acanturgut/home-server/logger"
)

// ChatStore persists chat sessions as raw JSON. The structure of a session is
// owned by the frontend; the backend only round-trips the bytes so we don't
// have to keep schemas in sync.
type ChatStore struct {
	mu   sync.RWMutex
	path string
	raw  json.RawMessage // JSON array
}

func NewChatStore(dataDir string) *ChatStore {
	c := &ChatStore{path: filepath.Join(dataDir, "chats.json"), raw: json.RawMessage("[]")}
	if err := jsonfile.Load(c.path, &c.raw); err != nil {
		logger.Error("chats: " + err.Error())
	}
	return c
}

// Get returns the raw JSON array of sessions.
func (c *ChatStore) Get() []byte {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return append([]byte(nil), c.raw...)
}

// Set replaces the stored sessions with the given JSON array.
func (c *ChatStore) Set(raw []byte) error {
	if len(raw) == 0 {
		raw = []byte("[]")
	}
	var probe []json.RawMessage
	if err := json.Unmarshal(raw, &probe); err != nil {
		return errors.New("expected JSON array of sessions")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := jsonfile.Write(c.path, raw); err != nil {
		return err
	}
	c.raw = raw
	return nil
}
