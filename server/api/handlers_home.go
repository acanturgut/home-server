package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/acanturgut/home-server/homedevices"
)

// SetHomeDevices wires the homedevices manager into the API. Called once
// from main after the manager is constructed so we don't have to thread it
// through NewHandler's already-long signature.
func (h *Handler) SetHomeDevices(m *homedevices.Manager) { h.homedev = m }

// GET /api/home/bridges
func (h *Handler) ListHomeBridges(w http.ResponseWriter, r *http.Request) {
	if h.homedev == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	writeJSON(w, http.StatusOK, h.homedev.Store().Bridges())
}

// POST /api/home/bridges
func (h *Handler) AddHomeBridge(w http.ResponseWriter, r *http.Request) {
	if h.homedev == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "home devices disabled"})
		return
	}
	var b homedevices.Bridge
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if b.Kind == "" || b.Host == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "kind and host required"})
		return
	}
	if b.Name == "" {
		b.Name = string(b.Kind) + "@" + b.Host
	}
	saved, err := h.homedev.Store().AddBridge(b)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	// Kick off an immediate poll so the UI sees devices fast.
	go h.homedev.PollOnce(r.Context())
	writeJSON(w, http.StatusOK, saved)
}

// PUT /api/home/bridges/{id}
func (h *Handler) UpdateHomeBridge(w http.ResponseWriter, r *http.Request) {
	if h.homedev == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "home devices disabled"})
		return
	}
	id := r.PathValue("id")
	var b homedevices.Bridge
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	b.ID = id
	if err := h.homedev.Store().UpdateBridge(b); err != nil {
		writeJSON(w, http.StatusNotFound, errorResp{Error: err.Error()})
		return
	}
	go h.homedev.PollOnce(r.Context())
	writeJSON(w, http.StatusOK, b)
}

// DELETE /api/home/bridges/{id}
func (h *Handler) DeleteHomeBridge(w http.ResponseWriter, r *http.Request) {
	if h.homedev == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "home devices disabled"})
		return
	}
	id := r.PathValue("id")
	if err := h.homedev.Store().DeleteBridge(id); err != nil {
		writeJSON(w, http.StatusNotFound, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

// GET /api/home/devices
func (h *Handler) ListHomeDevices(w http.ResponseWriter, r *http.Request) {
	if h.homedev == nil {
		writeJSON(w, http.StatusOK, map[string]any{"devices": []any{}, "bridges": []any{}})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"devices":      h.homedev.Devices(),
		"bridges":      h.homedev.Store().Bridges(),
		"last_updated": h.homedev.Store().LastUpdated(),
	})
}

// PUT /api/home/devices/{id}/override — set per-device room / type / hidden.
// Body: { "room": "...", "type": "...", "hidden": bool }. Empty room clears.
func (h *Handler) SetHomeDeviceOverride(w http.ResponseWriter, r *http.Request) {
	if h.homedev == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "home devices disabled"})
		return
	}
	id := r.PathValue("id")
	if id == "" {
		// Manual extraction fallback for IDs containing ':'.
		const prefix = "/api/home/devices/"
		rest := strings.TrimPrefix(r.URL.Path, prefix)
		if i := strings.LastIndex(rest, "/override"); i >= 0 {
			id = rest[:i]
		}
	}
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "device id required"})
		return
	}
	var o homedevices.DeviceOverride
	if err := json.NewDecoder(r.Body).Decode(&o); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if err := h.homedev.Overrides().Set(id, o); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/home/devices/{id}/action
// Path id may contain ':' so we route on a wildcard pattern.
func (h *Handler) ApplyHomeAction(w http.ResponseWriter, r *http.Request) {
	if h.homedev == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "home devices disabled"})
		return
	}
	// Path: /api/home/devices/{id}/action — extract id manually since '{id}'
	// in net/http patterns won't match values containing '/'. Our IDs use ':'
	// not '/' so PathValue("id") works, but also support a manual fallback.
	id := r.PathValue("id")
	if id == "" {
		// Manual extraction fallback.
		const prefix = "/api/home/devices/"
		rest := strings.TrimPrefix(r.URL.Path, prefix)
		if i := strings.LastIndex(rest, "/action"); i >= 0 {
			id = rest[:i]
		}
	}
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "device id required"})
		return
	}
	var a homedevices.Action
	if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if err := h.homedev.Apply(r.Context(), id, a); err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /api/home/devices/{id}/history?range=24h|7d|30d — sensor time-series.
// Returns samples for the requested device since `now - range`. Range defaults
// to 24h, max 30d (matches the on-disk retention window).
func (h *Handler) GetHomeDeviceHistory(w http.ResponseWriter, r *http.Request) {
	if h.homedev == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "home devices disabled"})
		return
	}
	id := r.PathValue("id")
	if id == "" {
		const prefix = "/api/home/devices/"
		rest := strings.TrimPrefix(r.URL.Path, prefix)
		if i := strings.LastIndex(rest, "/history"); i >= 0 {
			id = rest[:i]
		}
	}
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "device id required"})
		return
	}
	rangeStr := r.URL.Query().Get("range")
	if rangeStr == "" {
		rangeStr = "24h"
	}
	dur, err := time.ParseDuration(rangeStr)
	if err != nil || dur <= 0 {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid range"})
		return
	}
	if dur > 30*24*time.Hour {
		dur = 30 * 24 * time.Hour
	}
	since := time.Now().Add(-dur)
	samples := h.homedev.History().Series(id, since)
	writeJSON(w, http.StatusOK, map[string]any{
		"device_id": id,
		"range":     rangeStr,
		"since":     since,
		"samples":   samples,
	})
}

// POST /api/home/refresh — force an immediate poll of all bridges.
func (h *Handler) RefreshHomeDevices(w http.ResponseWriter, r *http.Request) {
	if h.homedev == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "home devices disabled"})
		return
	}
	go h.homedev.PollOnce(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/home/dirigera/pair — long-poll pairing handshake for an IKEA
// DIRIGERA hub. Body: { host, name? }. Blocks until the user presses the hub's
// action button (or ~90s timeout). Returns { access_token } on success.
func (h *Handler) PairDirigera(w http.ResponseWriter, r *http.Request) {
	if h.homedev == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "home devices disabled"})
		return
	}
	var body struct {
		Host string `json:"host"`
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	host := strings.TrimSpace(body.Host)
	if host == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "host required"})
		return
	}
	// Use a context independent of the request body so client back-pressure
	// doesn't kill the poll loop, but still abort if the client disconnects.
	ctx, cancel := context.WithTimeout(r.Context(), 95*time.Second)
	defer cancel()
	token, err := h.homedev.PairDirigera(ctx, host, body.Name)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"access_token": token})
}
