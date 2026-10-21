package auth

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	bcryptCost = bcrypt.MinCost
	s, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestMiddlewareGating(t *testing.T) {
	s := newTestStore(t)
	admin := s.Users()[0]
	viewer, err := s.CreateUser("viewer", "password123", RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	adminSess, _ := s.CreateSession(admin.ID)
	viewerSess, _ := s.CreateSession(viewer.ID)

	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
	mux := http.NewServeMux()
	mux.Handle("/api/public", ok)
	mux.Handle("/api/thing", ok)
	mux.Handle("/api/admin", RequireAdmin(ok))
	mux.Handle("/", ok)
	h := s.Middleware("/api/public")(mux)

	cases := []struct {
		name, method, path, cookie, bearer string
		want                               int
	}{
		{"public path", "GET", "/api/public", "", "", 204},
		{"public paths match exactly", "GET", "/api/public/x", "", "", 401},
		{"SPA renders without a session", "GET", "/", "", "", 204},
		{"API needs a session", "GET", "/api/thing", "", "", 401},
		{"session bearer is not accepted", "GET", "/api/thing", "", adminSess.Token, 401},
		{"viewer can read", "GET", "/api/thing", viewerSess.Token, "", 204},
		{"viewer can't write", "POST", "/api/thing", viewerSess.Token, "", 403},
		{"viewer isn't admin", "GET", "/api/admin", viewerSess.Token, "", 403},
		{"admin passes RequireAdmin", "POST", "/api/admin", adminSess.Token, "", 204},
	}
	for _, c := range cases {
		req := httptest.NewRequest(c.method, c.path, nil)
		if c.cookie != "" {
			req.AddCookie(&http.Cookie{Name: CookieName, Value: c.cookie})
		}
		if c.bearer != "" {
			req.Header.Set("Authorization", "Bearer "+c.bearer)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != c.want {
			t.Errorf("%s: got %d, want %d", c.name, rec.Code, c.want)
		}
	}
}

func TestLoginThrottleAndPasswordChange(t *testing.T) {
	s := newTestStore(t)
	u, err := s.CreateUser("bob", "correct-horse", RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	for range maxLoginFailures {
		if _, err := s.Login("bob", "wrong", "10.0.0.9"); errors.Is(err, ErrTooManyAttempts) {
			t.Fatal("throttled too early")
		}
	}
	if _, err := s.Login("bob", "correct-horse", "10.0.0.9"); !errors.Is(err, ErrTooManyAttempts) {
		t.Fatalf("want ErrTooManyAttempts, got %v", err)
	}
	if _, err := s.Login("bob", "correct-horse", "10.0.0.10"); err != nil {
		t.Fatalf("another client should still log in: %v", err)
	}

	keep, _ := s.CreateSession(u.ID)
	other, _ := s.CreateSession(u.ID)
	if err := s.SetPassword(u.ID, "new-password", keep.Token); err != nil {
		t.Fatal(err)
	}
	if _, ok := s.LookupSession(keep.Token); !ok {
		t.Error("caller's own session should survive a password change")
	}
	if _, ok := s.LookupSession(other.Token); ok {
		t.Error("other sessions should be revoked by a password change")
	}
}

func TestClientIPTrustsOnlyLocalProxy(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Forwarded-For", "6.6.6.6, 192.168.1.20")
	req.RemoteAddr = "127.0.0.1:5000"
	if got := ClientIP(req); got != "192.168.1.20" {
		t.Errorf("behind local proxy: got %q", got)
	}
	req.RemoteAddr = "192.168.1.30:5000"
	if got := ClientIP(req); got != "192.168.1.30" {
		t.Errorf("direct client spoofing XFF: got %q", got)
	}
}
