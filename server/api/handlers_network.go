package api

import (
	"encoding/json"
	"net/http"
	"strings"
)

// GET /api/network/devices — LAN device list (ARP table + reverse DNS).
func (h *Handler) NetworkDevices(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.lan.Scan())
}

// PUT /api/network/devices/{mac} — set or clear a custom display name.
// Body: {"name": "..."}; empty/missing name removes the override.
func (h *Handler) RenameNetworkDevice(w http.ResponseWriter, r *http.Request) {
	mac, ok := parseMAC(r.PathValue("mac"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "valid mac required"})
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if err := h.lan.SetName(mac, strings.TrimSpace(body.Name)); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"mac": mac, "name": body.Name})
}
