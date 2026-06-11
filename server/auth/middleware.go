package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// CookieName is exported so the API package can clear it on logout.
const CookieName = cookieName

type ctxKey int

const (
	ctxUserKey ctxKey = iota
)

// FromContext returns the authenticated user attached to ctx (set by Middleware).
func FromContext(ctx context.Context) (User, bool) {
	u, ok := ctx.Value(ctxUserKey).(User)
	return u, ok
}

// Middleware returns an http.Handler middleware that:
//   - reads the session cookie,
//   - looks up the user,
//   - rejects unauthenticated requests to protected paths,
//   - enforces role checks on mutating verbs for "viewer".
//
// `publicPrefixes` is a list of path prefixes that bypass auth entirely
// (e.g. login endpoint, static UI, root index — those still get served so the
// browser can render the login page).
func (s *Store) Middleware(publicPrefixes []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			path := r.URL.Path

			for _, p := range publicPrefixes {
				if strings.HasPrefix(path, p) {
					next.ServeHTTP(w, r)
					return
				}
			}

			// Identify the caller (cookie or Authorization: Bearer token).
			var token string
			if c, err := r.Cookie(cookieName); err == nil {
				token = c.Value
			}
			if token == "" {
				if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
					token = strings.TrimPrefix(h, "Bearer ")
				}
			}

			user, ok := s.LookupSession(token)
			isAPI := strings.HasPrefix(path, "/api/")
			if !ok {
				if isAPI {
					writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthenticated"})
					return
				}
				// Non-API (the SPA itself) is allowed through so the login page can render.
				next.ServeHTTP(w, r)
				return
			}

			// Viewer: deny mutating verbs on the API.
			if isAPI && user.Role == RoleViewer && isMutating(r.Method) {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "viewer role: read-only"})
				return
			}

			ctx := context.WithValue(r.Context(), ctxUserKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
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
func SetCookie(w http.ResponseWriter, token string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
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
