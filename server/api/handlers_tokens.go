package api

import (
	"encoding/json"
	"net/http"
	"strings"
)

// GET /api/tokens
func (h *Handler) ListTokens(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"tokens": h.tokens.List()})
}

// POST /api/tokens — create a new token. Body: { "name": "iPhone Shortcut" }
func (h *Handler) CreateToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req) // empty body is fine
	tok, err := h.tokens.Create(strings.TrimSpace(req.Name))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, tok)
}

// PATCH /api/tokens/{id} — rename. Body: { "name": "..." }
func (h *Handler) RenameToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if err := h.tokens.Rename(r.PathValue("id"), strings.TrimSpace(req.Name)); err != nil {
		writeJSON(w, http.StatusNotFound, errorResp{Error: err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/tokens/{id}/rotate — replace the secret in place.
func (h *Handler) RotateToken(w http.ResponseWriter, r *http.Request) {
	tok, err := h.tokens.Rotate(r.PathValue("id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, tok)
}

// DELETE /api/tokens/{id}
func (h *Handler) DeleteToken(w http.ResponseWriter, r *http.Request) {
	if err := h.tokens.Delete(r.PathValue("id")); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
