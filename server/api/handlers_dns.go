package api

import (
	"encoding/json"
	"net/http"

	"github.com/acanturgut/home-server/homedns"
)

// GET /api/dns/status
func (h *Handler) DNSStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.dns.Status())
}

// GET /api/dns/records
func (h *Handler) DNSRecords(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.dns.Records())
}

// POST /api/dns/records — add a single record.
func (h *Handler) AddDNSRecord(w http.ResponseWriter, r *http.Request) {
	var rec homedns.Record
	if err := json.NewDecoder(r.Body).Decode(&rec); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if err := h.dns.AddRecord(rec); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// PUT /api/dns/records — replace the entire record set.
func (h *Handler) ReplaceDNSRecords(w http.ResponseWriter, r *http.Request) {
	var recs []homedns.Record
	if err := json.NewDecoder(r.Body).Decode(&recs); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if err := h.dns.SetRecords(recs); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "count": len(recs)})
}

// DELETE /api/dns/records — remove a single record by name+type (+optional value).
//
// Body: { "name": "...", "type": "A", "value": "1.2.3.4" }
func (h *Handler) DeleteDNSRecord(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name  string `json:"name"`
		Type  string `json:"type"`
		Value string `json:"value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" || body.Type == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "name and type required"})
		return
	}
	if err := h.dns.DeleteRecord(body.Name, body.Type, body.Value); err != nil {
		writeJSON(w, http.StatusNotFound, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
