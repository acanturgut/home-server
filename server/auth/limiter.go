package auth

import (
	"errors"
	"sync"
	"time"
)

// ErrTooManyAttempts is returned by Login while a client is locked out.
var ErrTooManyAttempts = errors.New("too many failed logins, try again later")

const (
	loginWindow      = 15 * time.Minute
	maxLoginFailures = 10
)

// loginLimiter refuses logins from an IP after maxLoginFailures failures
// within loginWindow. Each bcrypt check costs ~200ms of CPU on the Pi, so
// this also caps how much an attacker can burn.
type loginLimiter struct {
	mu    sync.Mutex
	fails map[string]failCount
}

type failCount struct {
	n     int
	since time.Time
}

func (l *loginLimiter) blocked(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	f, ok := l.fails[ip]
	return ok && time.Since(f.since) < loginWindow && f.n >= maxLoginFailures
}

func (l *loginLimiter) record(ip string, failed bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if !failed {
		delete(l.fails, ip)
		return
	}
	now := time.Now()
	for k, f := range l.fails {
		if now.Sub(f.since) >= loginWindow {
			delete(l.fails, k)
		}
	}
	f := l.fails[ip]
	if f.n == 0 {
		f.since = now
	}
	f.n++
	l.fails[ip] = f
}
