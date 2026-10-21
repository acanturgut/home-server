// Package apitokens implements a small multi-token store. Each token is a
// 32-byte random secret with a human-readable label and timestamps. Clients
// (Apple Shortcuts, curl scripts) send it as `Authorization: Bearer …` to
// POST /api/ai/ask.
//
// State is persisted to ${DataDir}/api_tokens.json (0600, atomic writes).
package apitokens

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/acanturgut/home-server/jsonfile"
	"github.com/acanturgut/home-server/logger"
)

// lastUsedEvery limits how often a successful Verify rewrites the file.
const lastUsedEvery = time.Minute

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
	mu     sync.Mutex
	path   string
	tokens []Token
}

func NewStore(dataDir string) *Store {
	s := &Store{path: filepath.Join(dataDir, "api_tokens.json")}
	if err := jsonfile.Load(s.path, &s.tokens); err != nil {
		logger.Error("apitokens: " + err.Error())
	}
	return s
}

// List returns a copy of all tokens, newest first. Secrets are included: the
// settings UI (admin-only) lets the owner copy them again later.
func (s *Store) List() []Token {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := append([]Token(nil), s.tokens...)
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	return out
}

// Create generates a new token with the given label.
func (s *Store) Create(name string) (Token, error) {
	tok := Token{
		ID:        randomHex(8),
		Name:      defaultIfEmpty(name, "Untitled token"),
		Token:     randomHex(32),
		CreatedAt: time.Now().UTC(),
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tokens = append(s.tokens, tok)
	if err := s.saveLocked(); err != nil {
		s.tokens = s.tokens[:len(s.tokens)-1]
		return Token{}, err
	}
	return tok, nil
}

// Rename updates the human label of a token.
func (s *Store) Rename(id, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	i := s.indexLocked(id)
	if i < 0 {
		return errors.New("token not found")
	}
	s.tokens[i].Name = defaultIfEmpty(name, s.tokens[i].Name)
	return s.saveLocked()
}

// Rotate replaces the secret of an existing token in place. The old secret
// stops working immediately.
func (s *Store) Rotate(id string) (Token, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	i := s.indexLocked(id)
	if i < 0 {
		return Token{}, errors.New("token not found")
	}
	s.tokens[i].Token = randomHex(32)
	s.tokens[i].CreatedAt = time.Now().UTC()
	return s.tokens[i], s.saveLocked()
}

// Delete removes a token by id. It is a no-op if the id doesn't exist.
func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	i := s.indexLocked(id)
	if i < 0 {
		return nil
	}
	s.tokens = append(s.tokens[:i], s.tokens[i+1:]...)
	return s.saveLocked()
}

// Verify reports whether secret matches a stored token, comparing in
// constant time, and records when it was last used.
func (s *Store) Verify(secret string) bool {
	if secret == "" {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	match := -1
	for i := range s.tokens {
		if subtle.ConstantTimeCompare([]byte(s.tokens[i].Token), []byte(secret)) == 1 {
			match = i
		}
	}
	if match < 0 {
		return false
	}
	now := time.Now().UTC()
	if now.Sub(s.tokens[match].LastUsedAt) > lastUsedEvery {
		s.tokens[match].LastUsedAt = now
		if err := s.saveLocked(); err != nil {
			logger.Error("apitokens: " + err.Error())
		}
	}
	return true
}

func (s *Store) indexLocked(id string) int {
	for i := range s.tokens {
		if s.tokens[i].ID == id {
			return i
		}
	}
	return -1
}

func (s *Store) saveLocked() error { return jsonfile.Save(s.path, s.tokens) }

func randomHex(nBytes int) string {
	b := make([]byte, nBytes)
	_, _ = rand.Read(b) // never fails (crypto/rand panics on fatal error)
	return hex.EncodeToString(b)
}

func defaultIfEmpty(s, def string) string {
	if s == "" {
		return def
	}
	return s
}
