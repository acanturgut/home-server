package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/acanturgut/home-server/asusrouter"
	"github.com/acanturgut/home-server/network"
)

// SetRouter wires the asusrouter manager into the API. Called once from
// main; until then router endpoints respond as "not configured".
func (h *Handler) SetRouter(m *asusrouter.Manager) { h.router4 = m }

// GET /api/router/config — returns the redacted router config.
func (h *Handler) RouterConfig(w http.ResponseWriter, r *http.Request) {
	if h.router4 == nil {
		writeJSON(w, http.StatusOK, map[string]any{"configured": false})
		return
	}
	cfg := h.router4.RedactedConfig()
	writeJSON(w, http.StatusOK, map[string]any{
		"configured":   h.router4.Configured(),
		"has_password": h.router4.HasPassword(),
		"host":         cfg.Host,
		"username":     cfg.Username,
		"use_ssl":      cfg.UseSSL,
		"port":         cfg.Port,
		"verify_ssl":   cfg.Verify,
		"timeout_sec":  cfg.Timeout,
	})
}

// PUT /api/router/config — store router credentials.
func (h *Handler) UpdateRouterConfig(w http.ResponseWriter, r *http.Request) {
	if h.router4 == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "router manager not initialised"})
		return
	}
	var body asusrouter.Config
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if body.Host == "" || body.Username == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "host and username required"})
		return
	}
	if err := h.router4.SetConfig(body); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"saved": true})
}

// POST /api/router/test — log in once with the stored credentials.
func (h *Handler) TestRouter(w http.ResponseWriter, r *http.Request) {
	if h.router4 == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "router manager not initialised"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := h.router4.Test(ctx); err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /api/router/status — curated router status.
func (h *Handler) RouterStatus(w http.ResponseWriter, r *http.Request) {
	if h.router4 == nil || !h.router4.Configured() {
		writeJSON(w, http.StatusOK, map[string]any{"configured": false})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	s, err := h.router4.Status(ctx)
	if err != nil {
		if errors.Is(err, asusrouter.ErrNotConfigured) {
			writeJSON(w, http.StatusOK, map[string]any{"configured": false})
			return
		}
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"configured": true,
		"status":     s,
	})
}

// GET /api/router/clients — connected clients per the router.
func (h *Handler) RouterClients(w http.ResponseWriter, r *http.Request) {
	if h.router4 == nil || !h.router4.Configured() {
		writeJSON(w, http.StatusOK, map[string]any{"configured": false, "clients": []any{}})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	cs, err := h.router4.Clients(ctx)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	blocked, _ := h.router4.BlockedMACs(ctx) // best-effort; tolerate hiccups
	type enriched struct {
		asusrouter.RouterClient
		CustomName string `json:"custom_name,omitempty"`
		Blocked    bool   `json:"blocked"`
	}
	out := make([]enriched, 0, len(cs))
	for _, c := range cs {
		out = append(out, enriched{
			RouterClient: c,
			CustomName:   network.LookupName(c.MAC),
			Blocked:      blocked[c.MAC],
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"configured": true,
		"clients":    out,
	})
}

// POST /api/router/reboot — reboot the router.
func (h *Handler) RouterReboot(w http.ResponseWriter, r *http.Request) {
	if h.router4 == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "not configured"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := h.router4.Reboot(ctx); err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/router/restart-wireless — kick the wireless radios.
func (h *Handler) RouterRestartWireless(w http.ResponseWriter, r *http.Request) {
	if h.router4 == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "not configured"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := h.router4.RestartWireless(ctx); err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/router/wol — wake a MAC via the router.
func (h *Handler) RouterWOL(w http.ResponseWriter, r *http.Request) {
	if h.router4 == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "not configured"})
		return
	}
	var body struct {
		MAC string `json:"mac"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256)).Decode(&body); err != nil || body.MAC == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "mac required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := h.router4.WakeOnLAN(ctx, body.MAC); err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/router/block — block a MAC's internet access via parental controls.
//
//	body: { mac: "aa:bb:cc:dd:ee:ff", name?: "Living Room TV", blocked: true }
func (h *Handler) RouterBlock(w http.ResponseWriter, r *http.Request) {
	if h.router4 == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: "not configured"})
		return
	}
	var body struct {
		MAC     string `json:"mac"`
		Name    string `json:"name"`
		Blocked bool   `json:"blocked"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&body); err != nil || body.MAC == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "mac required"})
		return
	}
	if body.Name == "" {
		body.Name = network.LookupName(body.MAC)
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	if err := h.router4.SetBlocked(ctx, body.MAC, body.Name, body.Blocked); err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "blocked": body.Blocked})
}

// GET /api/router/blocked — current blocked-MAC set.
func (h *Handler) RouterBlocked(w http.ResponseWriter, r *http.Request) {
	if h.router4 == nil || !h.router4.Configured() {
		writeJSON(w, http.StatusOK, map[string]any{"configured": false, "blocked": []string{}})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	set, err := h.router4.BlockedMACs(ctx)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	macs := make([]string, 0, len(set))
	for m := range set {
		macs = append(macs, m)
	}
	writeJSON(w, http.StatusOK, map[string]any{"configured": true, "blocked": macs})
}
