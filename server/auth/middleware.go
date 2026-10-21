package auth

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"time"
)

// CookieName is exported so the API package can read and clear it.
const CookieName = cookieName

type ctxKey int

const ctxUserKey ctxKey = iota

// FromContext returns the authenticated user attached to ctx (set by Middleware).
func FromContext(ctx context.Context) (User, bool) {
	u, ok := ctx.Value(ctxUserKey).(User)
	return u, ok
}

// Middleware authenticates API requests by session cookie and makes viewers
// read-only. publicPaths (exact matches) bypass it; non-API paths (the SPA)
// are always served so the login page can render.
func (s *Store) Middleware(publicPaths ...string) func(http.Handler) http.Handler {
	public := make(map[string]bool, len(publicPaths))
	for _, p := range publicPaths {
		public[p] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if public[r.URL.Path] || !strings.HasPrefix(r.URL.Path, "/api/") {
				next.ServeHTTP(w, r)
				return
			}
			user, ok := s.fromRequest(r)
			if !ok {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthenticated"})
				return
			}
			if user.Role == RoleViewer && isMutating(r.Method) {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "viewer role: read-only"})
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxUserKey, user)))
		})
	}
}

// fromRequest resolves the session cookie on r.
func (s *Store) fromRequest(r *http.Request) (User, bool) {
	c, err := r.Cookie(cookieName)
	if err != nil {
		return User{}, false
	}
	return s.LookupSession(c.Value)
}

// RequireAdmin is a per-handler guard for endpoints that must run as admin.
// Use after Middleware.
func RequireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, ok := FromContext(r.Context())
		if !ok || u.Role != RoleAdmin {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "admin required"})
			return
		}
		next(w, r)
	}
}

// SetCookie writes the session cookie on a response.
func SetCookie(w http.ResponseWriter, r *http.Request, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   isHTTPS(r),
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(defaultSessionTTL),
	})
}

// ClearCookie expires the session cookie on a response.
func ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
		SameSite: http.SameSiteLaxMode,
	})
}

// ClientIP returns the caller's IP. X-Forwarded-For is honoured only from a
// loopback peer (Caddy on the same host), using the hop Caddy appended.
func ClientIP(r *http.Request) string {
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		ip = r.RemoteAddr
	}
	if fromLocalProxy(r) {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			hops := strings.Split(xff, ",")
			return strings.TrimSpace(hops[len(hops)-1])
		}
	}
	return ip
}

// isHTTPS reports whether the browser reached us over TLS, directly or via
// the local reverse proxy that terminates it.
func isHTTPS(r *http.Request) bool {
	return r.TLS != nil || (fromLocalProxy(r) && r.Header.Get("X-Forwarded-Proto") == "https")
}

func fromLocalProxy(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return false
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func isMutating(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	}
	return false
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
