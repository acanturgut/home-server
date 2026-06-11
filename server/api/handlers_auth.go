package api

import (
	"encoding/json"
	"net/http"

	"github.com/acanturgut/home-server/auth"
)

// SetAuth wires the auth store into the API. Call once from main.
func (h *Handler) SetAuth(s *auth.Store) { h.auth = s }

// ── Login / session ────────────────────────────────────────────────────

// POST /api/auth/login — { username, password } → sets session cookie.
func (h *Handler) AuthLogin(w http.ResponseWriter, r *http.Request) {
	if h.auth == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "auth disabled"})
		return
	}
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	user, err := h.auth.Authenticate(body.Username, body.Password)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, errorResp{Error: err.Error()})
		return
	}
	sess, err := h.auth.CreateSession(user.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	auth.SetCookie(w, sess.Token, r.TLS != nil)
	// Also return the session token in the body so non-browser clients
	// (e.g. the React Native app) can send it as `Authorization: Bearer`.
	writeJSON(w, http.StatusOK, map[string]any{"user": user, "token": sess.Token})
}

// POST /api/auth/logout
func (h *Handler) AuthLogout(w http.ResponseWriter, r *http.Request) {
	if h.auth != nil {
		if c, err := r.Cookie(auth.CookieName); err == nil {
			h.auth.DeleteSession(c.Value)
		}
	}
	auth.ClearCookie(w)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /api/auth/me — current user (or 401).
func (h *Handler) AuthMe(w http.ResponseWriter, r *http.Request) {
	u, ok := auth.FromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errorResp{Error: "unauthenticated"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

// POST /api/auth/change-password — change own password. { current, new }.
func (h *Handler) AuthChangePassword(w http.ResponseWriter, r *http.Request) {
	u, ok := auth.FromContext(r.Context())
	if !ok || h.auth == nil {
		writeJSON(w, http.StatusUnauthorized, errorResp{Error: "unauthenticated"})
		return
	}
	var body struct {
		Current string `json:"current"`
		New     string `json:"new"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if _, err := h.auth.Authenticate(u.Username, body.Current); err != nil {
		writeJSON(w, http.StatusForbidden, errorResp{Error: "current password incorrect"})
		return
	}
	if err := h.auth.SetPassword(u.ID, body.New); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ── User CRUD (admin only) ─────────────────────────────────────────────

// GET /api/auth/users
func (h *Handler) AuthListUsers(w http.ResponseWriter, r *http.Request) {
	if h.auth == nil {
		writeJSON(w, http.StatusOK, []auth.User{})
		return
	}
	writeJSON(w, http.StatusOK, h.auth.Users())
}

// POST /api/auth/users — { username, password, role }.
func (h *Handler) AuthCreateUser(w http.ResponseWriter, r *http.Request) {
	if h.auth == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "auth disabled"})
		return
	}
	var body struct {
		Username string    `json:"username"`
		Password string    `json:"password"`
		Role     auth.Role `json:"role"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	u, err := h.auth.CreateUser(body.Username, body.Password, body.Role)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	c := *u
	c.PasswordHash = ""
	writeJSON(w, http.StatusCreated, c)
}

// PUT /api/auth/users/{id}/role — { role }.
func (h *Handler) AuthSetRole(w http.ResponseWriter, r *http.Request) {
	if h.auth == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "auth disabled"})
		return
	}
	id := r.PathValue("id")
	var body struct {
		Role auth.Role `json:"role"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if err := h.auth.SetRole(id, body.Role); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// PUT /api/auth/users/{id}/password — admin reset, { new }.
func (h *Handler) AuthResetPassword(w http.ResponseWriter, r *http.Request) {
	if h.auth == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "auth disabled"})
		return
	}
	id := r.PathValue("id")
	var body struct {
		New string `json:"new"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if err := h.auth.SetPassword(id, body.New); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// DELETE /api/auth/users/{id}
func (h *Handler) AuthDeleteUser(w http.ResponseWriter, r *http.Request) {
	if h.auth == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "auth disabled"})
		return
	}
	id := r.PathValue("id")
	if err := h.auth.DeleteUser(id); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
