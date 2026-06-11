package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/acanturgut/home-server/network"
)

// GET /api/network/devices — LAN device list (ARP table + reverse DNS).
func (h *Handler) NetworkDevices(w http.ResponseWriter, r *http.Request) {
	res := network.Scan()
	writeJSON(w, http.StatusOK, res)
}

// PUT /api/network/devices/{mac} — set or clear a custom display name.
// Body: {"name": "..."}; empty/missing name removes the override.
func (h *Handler) RenameNetworkDevice(w http.ResponseWriter, r *http.Request) {
	mac := strings.ToLower(strings.TrimSpace(r.PathValue("mac")))
	if mac == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "mac required"})
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if err := network.SetName(mac, strings.TrimSpace(body.Name)); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"mac": mac, "name": body.Name})
}
