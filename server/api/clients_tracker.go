package api

import (
	"net"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// clientTracker keeps a small in-memory rolling window of recent HTTP
// requesters so the dashboard can show "who's hitting the home server right
// now" without persisting anything to disk.
type clientTracker struct {
	mu      sync.RWMutex
	clients map[string]*clientEntry
}

type clientEntry struct {
	IP        string    `json:"ip"`
	Count     int       `json:"count"`
	LastSeen  time.Time `json:"last_seen"`
	LastPath  string    `json:"last_path"`
	UserAgent string    `json:"user_agent,omitempty"`
}

var tracker = &clientTracker{clients: map[string]*clientEntry{}}

// clientIP extracts the best client IP from the request, preferring
// X-Forwarded-For when present (we sit behind nginx in production).
func clientIP(r *http.Request) string {
	if xf := r.Header.Get("X-Forwarded-For"); xf != "" {
		// First IP is the original client.
		if i := strings.Index(xf, ","); i >= 0 {
			return strings.TrimSpace(xf[:i])
		}
		return strings.TrimSpace(xf)
	}
	if xr := r.Header.Get("X-Real-IP"); xr != "" {
		return strings.TrimSpace(xr)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// trackerMiddleware records each incoming request's origin IP. Skips noisy
// long-poll endpoints to keep the table meaningful.
func trackerMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		// Only track API + UI navigations; skip static asset bursts and the
		// dashboard's own polling endpoints (would dominate the table).
		if strings.HasPrefix(path, "/assets/") ||
			strings.HasSuffix(path, ".woff2") ||
			strings.HasSuffix(path, ".svg") ||
			path == "/api/dashboard/clients" ||
			path == "/api/dashboard/cluster" {
			next.ServeHTTP(w, r)
			return
		}
		ip := clientIP(r)
		if ip == "" {
			next.ServeHTTP(w, r)
			return
		}
		tracker.mu.Lock()
		e := tracker.clients[ip]
		if e == nil {
			e = &clientEntry{IP: ip}
			tracker.clients[ip] = e
		}
		e.Count++
		e.LastSeen = time.Now()
		e.LastPath = path
		e.UserAgent = r.Header.Get("User-Agent")
		tracker.mu.Unlock()
		next.ServeHTTP(w, r)
	})
}

// trackerSnapshot returns recent clients, sorted by last-seen desc, pruned
// to entries seen in the last hour.
func trackerSnapshot() []clientEntry {
	cutoff := time.Now().Add(-1 * time.Hour)
	tracker.mu.RLock()
	out := make([]clientEntry, 0, len(tracker.clients))
	for _, e := range tracker.clients {
		if e.LastSeen.Before(cutoff) {
			continue
		}
		out = append(out, *e)
	}
	tracker.mu.RUnlock()
	sort.Slice(out, func(i, j int) bool {
		return out[i].LastSeen.After(out[j].LastSeen)
	})
	if len(out) > 20 {
		out = out[:20]
	}
	return out
}

// GET /api/dashboard/clients — recent HTTP requesters.
func (h *Handler) DashboardClients(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, trackerSnapshot())
}
