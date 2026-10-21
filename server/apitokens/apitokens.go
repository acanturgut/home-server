// Package apitokens implements a small multi-token store. Each token is a
// 32-byte random secret with a human-readable label and timestamps. Tokens
// are sent by clients (Apple Shortcuts, curl scripts) in
// the `Authorization: Bearer …` header to bypass cookie auth on a subset
// of public API endpoints.
//
// State is persisted as a JSON file under ${DataDir}/api_tokens.json with
// 0600 perms. The file is rewritten atomically on every mutation.
//
// On first start, if a legacy ${DataDir}/siri.json exists, its single
// token is migrated into a new entry labelled "Siri Shortcut" so existing
// clients keep working without re-pairing.
package apitokens

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// Token is a single named credential.
type Token struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Token      string    `json:"token"`
	CreatedAt  time.Time `json:"created_at"`
	LastUsedAt time.Time `json:"last_used_at,omitempty"`
}

// Store keeps the token list in memory and on disk.
type Store struct {
	mu      sync.RWMutex
	path    string
	legacy  string // path to siri.json for one-shot migration
	tokens  []Token
	dirty   bool
	persist chan struct{}
}

// NewStore opens or creates the store. It also performs the legacy
// siri.json migration on first run.
func NewStore(dataDir string) *Store {
	_ = os.MkdirAll(dataDir, 0o755)
	s := &Store{
		path:    filepath.Join(dataDir, "api_tokens.json"),
		legacy:  filepath.Join(dataDir, "siri.json"),
		persist: make(chan struct{}, 8),
	}
	s.load()
	s.migrateFromSiri()
	go s.persistWorker()
	return s
}

func (s *Store) load() {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return
	}
	var list []Token
	if err := json.Unmarshal(data, &list); err == nil {
		s.tokens = list
	}
}

func (s *Store) migrateFromSiri() {
	if len(s.tokens) > 0 {
		return
	}
	data, err := os.ReadFile(s.legacy)
	if err != nil {
		return
	}
	var legacy struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(data, &legacy); err != nil || legacy.Token == "" {
		return
	}
	s.tokens = append(s.tokens, Token{
		ID:        randomID(),
		Name:      "Siri Shortcut",
		Token:     legacy.Token,
		CreatedAt: time.Now().UTC(),
	})
	s.dirty = true
	s.persist <- struct{}{}
}

// List returns a copy of all tokens, newest first.
func (s *Store) List() []Token {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Token, len(s.tokens))
	copy(out, s.tokens)
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	return out
}

// Create generates a new token with the given label and returns it (only
// time the secret is exposed in full). Empty names are accepted but
// recommended against.
func (s *Store) Create(name string) (Token, error) {
	tok := Token{
		ID:        randomID(),
		Name:      defaultIfEmpty(name, "Untitled token"),
		Token:     newSecret(),
		CreatedAt: time.Now().UTC(),
	}
	s.mu.Lock()
	s.tokens = append(s.tokens, tok)
	s.mu.Unlock()
	s.queueSave()
	return tok, nil
}

// Rename updates the human label of a token.
func (s *Store) Rename(id, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.tokens {
		if s.tokens[i].ID == id {
			s.tokens[i].Name = defaultIfEmpty(name, s.tokens[i].Name)
			s.dirty = true
			s.queueSaveLocked()
			return nil
		}
	}
	return errors.New("token not found")
}

// Rotate replaces the secret of an existing token in place. The new secret
// is returned (and the old one stops working immediately).
func (s *Store) Rotate(id string) (Token, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.tokens {
		if s.tokens[i].ID == id {
			s.tokens[i].Token = newSecret()
			s.tokens[i].CreatedAt = time.Now().UTC()
			s.dirty = true
			s.queueSaveLocked()
			return s.tokens[i], nil
		}
	}
	return Token{}, errors.New("token not found")
}

// Delete removes a token by id. It is a no-op if the id doesn't exist.
func (s *Store) Delete(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.tokens[:0]
	for _, t := range s.tokens {
		if t.ID != id {
			out = append(out, t)
		}
	}
	s.tokens = out
	s.dirty = true
	s.queueSaveLocked()
}

// Verify returns the matching token (with updated LastUsedAt) when the
// supplied secret matches one in the store. The boolean is false on miss.
func (s *Store) Verify(secret string) (Token, bool) {
	if secret == "" {
		return Token{}, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.tokens {
		if s.tokens[i].Token == secret {
			s.tokens[i].LastUsedAt = time.Now().UTC()
			s.dirty = true
			s.queueSaveLocked()
			return s.tokens[i], true
		}
	}
	return Token{}, false
}

// queueSave triggers a persisted write soon. Safe to call without locking.
func (s *Store) queueSave() {
	s.mu.Lock()
	s.dirty = true
	s.mu.Unlock()
	s.queueSaveLocked()
}

func (s *Store) queueSaveLocked() {
	select {
	case s.persist <- struct{}{}:
	default:
	}
}

func (s *Store) persistWorker() {
	for range s.persist {
		s.flush()
	}
}

func (s *Store) flush() {
	s.mu.Lock()
	if !s.dirty {
		s.mu.Unlock()
		return
	}
	data, err := json.MarshalIndent(s.tokens, "", "  ")
	if err != nil {
		s.mu.Unlock()
		return
	}
	s.dirty = false
	s.mu.Unlock()

	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return
	}
	_ = os.Rename(tmp, s.path)
}

// ── helpers ────────────────────────────────────────────────────────────

func newSecret() string {
	var b [32]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

func randomID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

func defaultIfEmpty(s, def string) string {
	if s == "" {
		return def
	}
	return s
}
