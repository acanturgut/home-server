package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/acanturgut/home-server/auth"
)

// ── Login / session ────────────────────────────────────────────────────

// POST /api/auth/login — { username, password } → sets the session cookie.
func (h *Handler) AuthLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	user, err := h.auth.Login(body.Username, body.Password, auth.ClientIP(r))
	if errors.Is(err, auth.ErrTooManyAttempts) {
		writeJSON(w, http.StatusTooManyRequests, errorResp{Error: err.Error()})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, errorResp{Error: err.Error()})
		return
	}
	sess, err := h.auth.CreateSession(user.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	auth.SetCookie(w, r, sess.Token)
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

// POST /api/auth/logout
func (h *Handler) AuthLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(auth.CookieName); err == nil {
		h.auth.DeleteSession(c.Value)
	}
	auth.ClearCookie(w)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /api/auth/me — current user.
func (h *Handler) AuthMe(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.FromContext(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

// POST /api/auth/change-password — { current, new }. Signs out the user's
// other sessions.
func (h *Handler) AuthChangePassword(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.FromContext(r.Context())
	var body struct {
		Current string `json:"current"`
		New     string `json:"new"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if _, err := h.auth.Login(u.Username, body.Current, auth.ClientIP(r)); err != nil {
		writeJSON(w, http.StatusForbidden, errorResp{Error: "current password incorrect"})
		return
	}
	current := ""
	if c, err := r.Cookie(auth.CookieName); err == nil {
		current = c.Value
	}
	if err := h.auth.SetPassword(u.ID, body.New, current); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ── User CRUD (admin only) ─────────────────────────────────────────────

// GET /api/auth/users
func (h *Handler) AuthListUsers(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.auth.Users())
}

// POST /api/auth/users — { username, password, role }.
func (h *Handler) AuthCreateUser(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string    `json:"username"`
		Password string    `json:"password"`
		Role     auth.Role `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
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
	var body struct {
		Role auth.Role `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if err := h.auth.SetRole(r.PathValue("id"), body.Role); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// PUT /api/auth/users/{id}/password — admin reset, { new }. Signs the user
// out everywhere.
func (h *Handler) AuthResetPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		New string `json:"new"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if err := h.auth.SetPassword(r.PathValue("id"), body.New, ""); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// DELETE /api/auth/users/{id}
func (h *Handler) AuthDeleteUser(w http.ResponseWriter, r *http.Request) {
	if err := h.auth.DeleteUser(r.PathValue("id")); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
