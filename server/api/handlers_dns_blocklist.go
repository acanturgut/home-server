package api

import (
	"encoding/json"
	"net/http"
)

// GET /api/dns/blocklist
func (h *Handler) DNSBlocklistStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.dns.BlocklistStatus())
}

// PUT /api/dns/blocklist — { enabled: bool }
func (h *Handler) DNSBlocklistSetEnabled(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if err := h.dns.BlocklistSetEnabled(body.Enabled); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/dns/blocklist/sources — { name, url }
func (h *Handler) DNSBlocklistAddSource(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
		URL  string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if err := h.dns.BlocklistAddSource(body.Name, body.URL); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// DELETE /api/dns/blocklist/sources — { url }
func (h *Handler) DNSBlocklistRemoveSource(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.URL == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "url required"})
		return
	}
	if err := h.dns.BlocklistRemoveSource(body.URL); err != nil {
		writeJSON(w, http.StatusNotFound, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// PUT /api/dns/blocklist/sources/toggle — { url, enabled }
func (h *Handler) DNSBlocklistToggleSource(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URL     string `json:"url"`
		Enabled bool   `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.URL == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "url required"})
		return
	}
	if err := h.dns.BlocklistToggleSource(body.URL, body.Enabled); err != nil {
		writeJSON(w, http.StatusNotFound, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/dns/blocklist/refresh — kick off async refresh.
func (h *Handler) DNSBlocklistRefresh(w http.ResponseWriter, r *http.Request) {
	h.dns.BlocklistRefresh()
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/dns/blocklist/allow — { domain }
func (h *Handler) DNSBlocklistAddAllow(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Domain string `json:"domain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Domain == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "domain required"})
		return
	}
	if err := h.dns.BlocklistAddAllow(body.Domain); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// DELETE /api/dns/blocklist/allow — { domain }
func (h *Handler) DNSBlocklistRemoveAllow(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Domain string `json:"domain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Domain == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "domain required"})
		return
	}
	if err := h.dns.BlocklistRemoveAllow(body.Domain); err != nil {
		writeJSON(w, http.StatusNotFound, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
