// Package auth implements user accounts, login sessions, and HTTP middleware
// for the home-server API.
//
// Storage layout (all under <DATA_DIR>):
//
//	users.json     — list of {id, username, role, password_hash, created_at}
//	sessions.json  — list of {token, user_id, created_at, expires_at}
//
// The first time the server starts and no users exist, a bootstrap "admin"
// account is created and a one-time random password is logged to stderr.
//
// Roles:
//
//	admin  — full access (all endpoints)
//	viewer — read-only (GET only). Mutating endpoints return 403.
//
// Sessions are 32-byte random tokens stored server-side (so logout/revocation
// works) and shipped to the browser as a `Secure?,HttpOnly,SameSite=Lax`
// cookie. Default lifetime: 30 days; refreshed (sliding) on each call.
package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const (
	cookieName        = "hs_session"
	defaultSessionTTL = 30 * 24 * time.Hour
	bcryptCost        = 12
)

// Role enumerates per-user permission levels.
type Role string

const (
	RoleAdmin  Role = "admin"
	RoleViewer Role = "viewer"
)

// User is one account record.
type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	Role         Role      `json:"role"`
	PasswordHash string    `json:"password_hash"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Session is a server-tracked login token.
type Session struct {
	Token     string    `json:"token"`
	UserID    string    `json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

// Store owns user + session persistence and is safe for concurrent use.
type Store struct {
	mu        sync.RWMutex
	usersPath string
	sessPath  string
	users     map[string]*User    // by ID
	sessions  map[string]*Session // by token
}

// NewStore loads (or initialises) data from dataDir. If no users exist yet,
// it creates an "admin" account with a random password and logs it.
func NewStore(dataDir string) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, err
	}
	s := &Store{
		usersPath: filepath.Join(dataDir, "users.json"),
		sessPath:  filepath.Join(dataDir, "sessions.json"),
		users:     map[string]*User{},
		sessions:  map[string]*Session{},
	}
	if err := s.loadUsers(); err != nil {
		return nil, err
	}
	if err := s.loadSessions(); err != nil {
		return nil, err
	}
	if len(s.users) == 0 {
		password, err := randomToken(12)
		if err != nil {
			return nil, err
		}
		if _, err := s.CreateUser("admin", password, RoleAdmin); err != nil {
			return nil, err
		}
		fmt.Fprintf(os.Stderr,
			"\n========================================\n"+
				"  home-server: bootstrap admin created\n"+
				"  username: admin\n"+
				"  password: %s\n"+
				"  (change this in Settings → Users)\n"+
				"========================================\n\n",
			password,
		)
	}
	go s.gcSessions()
	return s, nil
}

// ── Users ───────────────────────────────────────────────────────────────

// CreateUser hashes the password and persists a new account.
func (s *Store) CreateUser(username, password string, role Role) (*User, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	if username == "" {
		return nil, errors.New("username required")
	}
	if len(password) < 8 {
		return nil, errors.New("password must be at least 8 characters")
	}
	if role != RoleAdmin && role != RoleViewer {
		role = RoleViewer
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return nil, err
	}
	id, err := randomToken(8)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	u := &User{
		ID:           id,
		Username:     username,
		Role:         role,
		PasswordHash: string(hash),
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	s.mu.Lock()
	for _, ex := range s.users {
		if ex.Username == username {
			s.mu.Unlock()
			return nil, errors.New("username already exists")
		}
	}
	s.users[u.ID] = u
	s.mu.Unlock()
	if err := s.saveUsers(); err != nil {
		return nil, err
	}
	return u, nil
}

// Users returns a copy of all users (without password hashes).
func (s *Store) Users() []User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]User, 0, len(s.users))
	for _, u := range s.users {
		c := *u
		c.PasswordHash = ""
		out = append(out, c)
	}
	return out
}

// SetPassword updates a user's password (also called by self-service change).
func (s *Store) SetPassword(userID, newPassword string) error {
	if len(newPassword) < 8 {
		return errors.New("password must be at least 8 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcryptCost)
	if err != nil {
		return err
	}
	s.mu.Lock()
	u, ok := s.users[userID]
	if !ok {
		s.mu.Unlock()
		return errors.New("user not found")
	}
	u.PasswordHash = string(hash)
	u.UpdatedAt = time.Now()
	s.mu.Unlock()
	return s.saveUsers()
}

// SetRole changes a user's role. The last remaining admin cannot be demoted.
func (s *Store) SetRole(userID string, role Role) error {
	if role != RoleAdmin && role != RoleViewer {
		return errors.New("invalid role")
	}
	s.mu.Lock()
	u, ok := s.users[userID]
	if !ok {
		s.mu.Unlock()
		return errors.New("user not found")
	}
	if u.Role == RoleAdmin && role != RoleAdmin && s.adminCountLocked() <= 1 {
		s.mu.Unlock()
		return errors.New("cannot demote the only admin")
	}
	u.Role = role
	u.UpdatedAt = time.Now()
	s.mu.Unlock()
	return s.saveUsers()
}

// DeleteUser removes a user and revokes all of their sessions.
func (s *Store) DeleteUser(userID string) error {
	s.mu.Lock()
	u, ok := s.users[userID]
	if !ok {
		s.mu.Unlock()
		return errors.New("user not found")
	}
	if u.Role == RoleAdmin && s.adminCountLocked() <= 1 {
		s.mu.Unlock()
		return errors.New("cannot delete the only admin")
	}
	delete(s.users, userID)
	for tok, sess := range s.sessions {
		if sess.UserID == userID {
			delete(s.sessions, tok)
		}
	}
	s.mu.Unlock()
	if err := s.saveUsers(); err != nil {
		return err
	}
	return s.saveSessions()
}

func (s *Store) adminCountLocked() int {
	n := 0
	for _, u := range s.users {
		if u.Role == RoleAdmin {
			n++
		}
	}
	return n
}

// ── Auth ────────────────────────────────────────────────────────────────

// Authenticate verifies username+password and returns the matching user
// (with password hash stripped) on success.
func (s *Store) Authenticate(username, password string) (User, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	s.mu.RLock()
	var found *User
	for _, u := range s.users {
		if u.Username == username {
			found = u
			break
		}
	}
	s.mu.RUnlock()
	if found == nil {
		// Don't leak which username exists.
		_ = bcrypt.CompareHashAndPassword(
			[]byte("$2a$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMN0a"),
			[]byte(password),
		)
		return User{}, errors.New("invalid credentials")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(found.PasswordHash), []byte(password)); err != nil {
		return User{}, errors.New("invalid credentials")
	}
	c := *found
	c.PasswordHash = ""
	return c, nil
}

// CreateSession persists a fresh session for userID and returns the token.
func (s *Store) CreateSession(userID string) (Session, error) {
	tok, err := randomToken(32)
	if err != nil {
		return Session{}, err
	}
	now := time.Now()
	sess := Session{
		Token:     tok,
		UserID:    userID,
		CreatedAt: now,
		ExpiresAt: now.Add(defaultSessionTTL),
	}
	s.mu.Lock()
	s.sessions[tok] = &sess
	s.mu.Unlock()
	_ = s.saveSessions()
	return sess, nil
}

// LookupSession returns the user for a token, refreshing the session's
// expiry on success (sliding window).
func (s *Store) LookupSession(token string) (User, bool) {
	s.mu.Lock()
	sess, ok := s.sessions[token]
	if !ok {
		s.mu.Unlock()
		return User{}, false
	}
	if time.Now().After(sess.ExpiresAt) {
		delete(s.sessions, token)
		s.mu.Unlock()
		_ = s.saveSessions()
		return User{}, false
	}
	user, ok := s.users[sess.UserID]
	if !ok {
		delete(s.sessions, token)
		s.mu.Unlock()
		_ = s.saveSessions()
		return User{}, false
	}
	// Slide.
	if time.Until(sess.ExpiresAt) < defaultSessionTTL/2 {
		sess.ExpiresAt = time.Now().Add(defaultSessionTTL)
	}
	out := *user
	out.PasswordHash = ""
	s.mu.Unlock()
	return out, true
}

// DeleteSession revokes one session token.
func (s *Store) DeleteSession(token string) {
	s.mu.Lock()
	delete(s.sessions, token)
	s.mu.Unlock()
	_ = s.saveSessions()
}

// gcSessions periodically prunes expired sessions.
func (s *Store) gcSessions() {
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for range t.C {
		now := time.Now()
		s.mu.Lock()
		changed := false
		for tok, sess := range s.sessions {
			if now.After(sess.ExpiresAt) {
				delete(s.sessions, tok)
				changed = true
			}
		}
		s.mu.Unlock()
		if changed {
			_ = s.saveSessions()
		}
	}
}

// ── Persistence ─────────────────────────────────────────────────────────

func (s *Store) loadUsers() error {
	data, err := os.ReadFile(s.usersPath)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	var list []User
	if err := json.Unmarshal(data, &list); err != nil {
		return err
	}
	for i := range list {
		s.users[list[i].ID] = &list[i]
	}
	return nil
}

func (s *Store) saveUsers() error {
	s.mu.RLock()
	list := make([]User, 0, len(s.users))
	for _, u := range s.users {
		list = append(list, *u)
	}
	s.mu.RUnlock()
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.usersPath, data, 0600)
}

func (s *Store) loadSessions() error {
	data, err := os.ReadFile(s.sessPath)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	var list []Session
	if err := json.Unmarshal(data, &list); err != nil {
		return err
	}
	now := time.Now()
	for i := range list {
		if now.Before(list[i].ExpiresAt) {
			s.sessions[list[i].Token] = &list[i]
		}
	}
	return nil
}

func (s *Store) saveSessions() error {
	s.mu.RLock()
	list := make([]Session, 0, len(s.sessions))
	for _, sess := range s.sessions {
		list = append(list, *sess)
	}
	s.mu.RUnlock()
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.sessPath, data, 0600)
}

// ── Helpers ─────────────────────────────────────────────────────────────

func randomToken(nBytes int) (string, error) {
	b := make([]byte, nBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
