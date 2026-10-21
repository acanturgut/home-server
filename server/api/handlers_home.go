package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/acanturgut/home-server/homedevices"
)

// pollSoon refreshes all bridges in the background so the UI sees changes
// quickly. It must outlive the request that triggered it.
func (h *Handler) pollSoon(r *http.Request) {
	go h.home.PollOnce(context.WithoutCancel(r.Context()))
}

// GET /api/home/bridges (admin)
func (h *Handler) ListHomeBridges(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.home.Store().Bridges())
}

// POST /api/home/bridges (admin)
func (h *Handler) AddHomeBridge(w http.ResponseWriter, r *http.Request) {
	var b homedevices.Bridge
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	b.ID, b.Status, b.Error = "", "", ""
	b.Host = strings.TrimSpace(b.Host)
	if err := b.Validate(); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	if b.Name == "" {
		b.Name = string(b.Kind) + "@" + b.Host
	}
	saved, err := h.home.Store().AddBridge(b)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	h.pollSoon(r)
	writeJSON(w, http.StatusOK, saved)
}

// PUT /api/home/bridges/{id} (admin) — merges the body onto the stored
// bridge; an empty token keeps the current one.
func (h *Handler) UpdateHomeBridge(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	b, ok := h.home.Store().Bridge(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "bridge not found"})
		return
	}
	token := b.Token
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	b.ID = id
	b.Host = strings.TrimSpace(b.Host)
	if b.Token == "" {
		b.Token = token
	}
	if err := b.Validate(); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return
	}
	if err := h.home.Store().UpdateBridge(b); err != nil {
		writeJSON(w, http.StatusNotFound, errorResp{Error: err.Error()})
		return
	}
	h.pollSoon(r)
	writeJSON(w, http.StatusOK, b)
}

// DELETE /api/home/bridges/{id} (admin)
func (h *Handler) DeleteHomeBridge(w http.ResponseWriter, r *http.Request) {
	if err := h.home.Store().DeleteBridge(r.PathValue("id")); err != nil {
		writeJSON(w, http.StatusNotFound, errorResp{Error: err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/home/devices — bridges are included for status display only, so
// their credentials and config are left out.
func (h *Handler) ListHomeDevices(w http.ResponseWriter, r *http.Request) {
	bridges := h.home.Store().Bridges()
	for i := range bridges {
		bridges[i].Token, bridges[i].Config = "", nil
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"devices":      h.home.Devices(),
		"bridges":      bridges,
		"last_updated": h.home.Store().LastUpdated(),
	})
}

// PUT /api/home/devices/{id}/override — set per-device name / room / type /
// hidden. Body: { "name", "room", "type", "hidden" }. Empty values clear.
func (h *Handler) SetHomeDeviceOverride(w http.ResponseWriter, r *http.Request) {
	var o homedevices.DeviceOverride
	if err := json.NewDecoder(r.Body).Decode(&o); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if err := h.home.Overrides().Set(r.PathValue("id"), o); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/home/devices/{id}/action
func (h *Handler) ApplyHomeAction(w http.ResponseWriter, r *http.Request) {
	var a homedevices.Action
	if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if err := h.home.Apply(r.Context(), r.PathValue("id"), a); err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /api/home/devices/{id}/history?range=24h|168h|720h — sensor time
// series since now-range. Defaults to 24h, capped at the 30-day retention.
func (h *Handler) GetHomeDeviceHistory(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	rangeStr := r.URL.Query().Get("range")
	if rangeStr == "" {
		rangeStr = "24h"
	}
	dur, err := time.ParseDuration(rangeStr)
	if err != nil || dur <= 0 {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid range"})
		return
	}
	dur = min(dur, 30*24*time.Hour)
	since := time.Now().Add(-dur)
	writeJSON(w, http.StatusOK, map[string]any{
		"device_id": id,
		"range":     rangeStr,
		"since":     since,
		"samples":   h.home.History().Series(id, since),
	})
}

// POST /api/home/refresh — force an immediate poll of all bridges.
func (h *Handler) RefreshHomeDevices(w http.ResponseWriter, r *http.Request) {
	h.pollSoon(r)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type pairReq struct {
	Host string `json:"host"`
	Name string `json:"name"`
}

func decodePairReq(w http.ResponseWriter, r *http.Request) (pairReq, bool) {
	var body pairReq
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return body, false
	}
	body.Host = strings.TrimSpace(body.Host)
	if err := (homedevices.Bridge{Kind: homedevices.KindHue, Host: body.Host}).Validate(); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: err.Error()})
		return body, false
	}
	return body, true
}

// POST /api/home/dirigera/pair (admin) — long-poll pairing handshake for an
// IKEA DIRIGERA hub. Body: { host, name? }. Blocks until the user presses the
// hub's action button (~90s timeout, or until the client disconnects).
func (h *Handler) PairDirigera(w http.ResponseWriter, r *http.Request) {
	body, ok := decodePairReq(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 95*time.Second)
	defer cancel()
	token, err := h.home.PairDirigera(ctx, body.Host, body.Name)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"access_token": token})
}

// POST /api/home/hue/pair (admin) — mints a Hue application key. Body:
// { host }. Press the bridge's link button first. Done server-side because a
// browser on the HTTPS dashboard can't call the bridge's plain-HTTP API.
func (h *Handler) PairHue(w http.ResponseWriter, r *http.Request) {
	body, ok := decodePairReq(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	token, err := h.home.PairHue(ctx, body.Host)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"access_token": token})
}
