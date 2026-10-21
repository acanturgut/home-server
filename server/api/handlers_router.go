package api

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"time"

	"github.com/acanturgut/home-server/asusrouter"
)

// GET /api/router/config — returns the redacted router config.
func (h *Handler) RouterConfig(w http.ResponseWriter, r *http.Request) {
	cfg := h.asus.RedactedConfig()
	writeJSON(w, http.StatusOK, map[string]any{
		"configured":   h.asus.Configured(),
		"has_password": h.asus.HasPassword(),
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
	var body asusrouter.Config
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	if body.Host == "" || body.Username == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "host and username required"})
		return
	}
	if err := h.asus.SetConfig(body); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"saved": true})
}

// POST /api/router/test — log in once with the stored credentials.
func (h *Handler) TestRouter(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := h.asus.Test(ctx); err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /api/router/status — curated router status.
func (h *Handler) RouterStatus(w http.ResponseWriter, r *http.Request) {
	if !h.asus.Configured() {
		writeJSON(w, http.StatusOK, map[string]any{"configured": false})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	s, err := h.asus.Status(ctx)
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
	if !h.asus.Configured() {
		writeJSON(w, http.StatusOK, map[string]any{"configured": false, "clients": []any{}})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	cs, err := h.asus.Clients(ctx)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	blocked, _ := h.asus.BlockedMACs(ctx) // best-effort; tolerate hiccups
	type enriched struct {
		asusrouter.RouterClient
		CustomName string `json:"custom_name,omitempty"`
		Blocked    bool   `json:"blocked"`
	}
	out := make([]enriched, 0, len(cs))
	for _, c := range cs {
		out = append(out, enriched{
			RouterClient: c,
			CustomName:   h.lan.LookupName(c.MAC),
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
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := h.asus.Reboot(ctx); err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/router/restart-wireless — kick the wireless radios.
func (h *Handler) RouterRestartWireless(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := h.asus.RestartWireless(ctx); err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/router/wol — wake a MAC via the router.
func (h *Handler) RouterWOL(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MAC string `json:"mac"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	mac, ok := parseMAC(body.MAC)
	if !ok {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "valid mac required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := h.asus.WakeOnLAN(ctx, mac); err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/router/block — block a MAC's internet access via parental controls.
//
//	body: { mac: "aa:bb:cc:dd:ee:ff", name?: "Living Room TV", blocked: true }
func (h *Handler) RouterBlock(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MAC     string `json:"mac"`
		Name    string `json:"name"`
		Blocked bool   `json:"blocked"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid body"})
		return
	}
	mac, ok := parseMAC(body.MAC)
	if !ok {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "valid mac required"})
		return
	}
	if body.Name == "" {
		body.Name = h.lan.LookupName(mac)
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	if err := h.asus.SetBlocked(ctx, mac, body.Name, body.Blocked); err != nil {
		writeJSON(w, http.StatusBadGateway, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "blocked": body.Blocked})
}

// parseMAC normalises a MAC to lowercase colon form, rejecting anything
// net.ParseMAC doesn't accept (the router stores MACs in '>'-delimited lists).
func parseMAC(s string) (string, bool) {
	hw, err := net.ParseMAC(s)
	if err != nil || len(hw) != 6 {
		return "", false
	}
	return hw.String(), true
}
