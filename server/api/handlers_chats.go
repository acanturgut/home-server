package api

import (
	"io"
	"net/http"
)

// GET /api/chats
func (h *Handler) ListChats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(h.chats.Get())
}

// PUT /api/chats — replaces the whole chat-sessions array. The UI sends the
// latest array after every change.
func (h *Handler) SaveChats(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	if err := h.chats.Set(body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
