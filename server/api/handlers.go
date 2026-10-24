package api

import (
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"time"

	"github.com/acanturgut/home-server/ai"
	"github.com/acanturgut/home-server/assistant"
	"github.com/acanturgut/home-server/asusrouter"
	"github.com/acanturgut/home-server/auth"
	"github.com/acanturgut/home-server/config"
	"github.com/acanturgut/home-server/homedevices"
	"github.com/acanturgut/home-server/homedns"
	"github.com/acanturgut/home-server/homekit"
	"github.com/acanturgut/home-server/logger"
	"github.com/acanturgut/home-server/network"
	"github.com/acanturgut/home-server/nodestate"
	"github.com/acanturgut/home-server/wol"
	"github.com/google/uuid"
)

// Deps are the services the HTTP API is built on. Every field is required.
type Deps struct {
	AI        *ai.Router
	Config    *config.Config
	Nodes     *config.NodeStore
	NodeState *nodestate.Store
	NodeHist  *nodestate.History
	Settings  *assistant.SettingsStore
	Chats     *assistant.ChatStore
	Home      *homedevices.Manager
	Asus      *asusrouter.Manager
	LAN       *network.Scanner
	DNS       *homedns.Server
	Auth      *auth.Store
	Version   string
}

type Handler struct {
	ai       *ai.Router
	cfg      *config.Config
	nodes    *config.NodeStore
	ns       *nodestate.Store
	nodeHist *nodestate.History
	settings *assistant.SettingsStore
	chats    *assistant.ChatStore
	home     *homedevices.Manager
	asus     *asusrouter.Manager
	lan      *network.Scanner
	dns      *homedns.Server
	auth     *auth.Store
	version  string
	started  time.Time
	sysHist  *sysHistory
	overview overviewCache
}

func NewHandler(d Deps) *Handler {
	return &Handler{
		ai:       d.AI,
		cfg:      d.Config,
		nodes:    d.Nodes,
		ns:       d.NodeState,
		nodeHist: d.NodeHist,
		settings: d.Settings,
		chats:    d.Chats,
		home:     d.Home,
		asus:     d.Asus,
		lan:      d.LAN,
		dns:      d.DNS,
		auth:     d.Auth,
		version:  d.Version,
		started:  time.Now(),
		sysHist:  newSysHistory(60),
	}
}

type chatReq struct {
	Messages    []ai.Message `json:"messages"`
	Route       string       `json:"route,omitempty"` // ""|"auto"|"light"|"heavy"|<node-name>
	Temperature *float64     `json:"temperature,omitempty"`
}

type errorResp struct {
	Error string `json:"error"`
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func isAdmin(r *http.Request) bool {
	u, ok := auth.FromContext(r.Context())
	return ok && u.Role == auth.RoleAdmin
}

// POST /api/chat
func (h *Handler) Chat(w http.ResponseWriter, r *http.Request) {
	var req chatReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if len(req.Messages) == 0 {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "messages required"})
		return
	}
	resp, err := h.ai.Chat(r.Context(), uuid.New().String(), req.Messages)
	if err != nil {
		logger.Error("chat error: " + err.Error())
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: "ai request failed"})
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// POST /api/chat/stream
func (h *Handler) ChatStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: "streaming not supported"})
		return
	}
	var req chatReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if len(req.Messages) == 0 {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "messages required"})
		return
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	enc := json.NewEncoder(w)
	opts := ai.ChatStreamOpts{Route: req.Route, Temperature: req.Temperature}
	h.ai.ChatStream(r.Context(), uuid.New().String(), req.Messages, opts, func(event ai.StreamEvent) {
		_ = enc.Encode(event)
		flusher.Flush()
	})
}

// GET /api/homekit — the pairing code is admin-only.
func (h *Handler) HomeKit(w http.ResponseWriter, r *http.Request) {
	var accessories []map[string]any
	for _, n := range h.nodes.All() {
		if n.MAC == "" {
			continue
		}
		accessories = append(accessories, map[string]any{
			"id":   n.ID,
			"name": n.Name,
			"mac":  n.MAC,
			"host": n.Host,
		})
	}
	pin, setupURI := "", ""
	if isAdmin(r) {
		pin = h.cfg.HomeKitPIN
		if len(pin) == 8 {
			pin = pin[:3] + "-" + pin[3:5] + "-" + pin[5:]
		}
		setupURI = homekit.SetupURI(h.cfg.HomeKitPIN)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"bridge":      "Home Server",
		"pin":         pin,
		"port":        51826,
		"setup_uri":   setupURI,
		"accessories": accessories,
	})
}

// GET /api/health
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":   "ok",
		"backends": h.ai.Status(r.Context()),
	})
}

// GET /api/logs?n=50
func (h *Handler) Logs(w http.ResponseWriter, r *http.Request) {
	n := 50
	if parsed, err := strconv.Atoi(r.URL.Query().Get("n")); err == nil && parsed > 0 && parsed <= 1000 {
		n = parsed
	}
	writeJSON(w, http.StatusOK, logger.Recent(n))
}

// GET /api/nodes
func (h *Handler) GetNodes(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.nodes.All())
}

// POST /api/nodes
func (h *Handler) AddNode(w http.ResponseWriter, r *http.Request) {
	var node config.Node
	if err := json.NewDecoder(r.Body).Decode(&node); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if node.Name == "" || node.Host == "" || node.Tier == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "name, host, and tier are required"})
		return
	}
	if !validTier(node.Tier) {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "tier must be 'high-end' or 'low-end'"})
		return
	}
	if node.ID == "" {
		node.ID = uuid.New().String()[:8]
	}
	if err := h.nodes.Add(node); err != nil {
		writeJSON(w, http.StatusConflict, errorResp{Error: "node already exists"})
		return
	}
	logger.Info("node added: " + node.Name + " (" + string(node.Tier) + ") at " + node.Host)
	writeJSON(w, http.StatusCreated, node)
}

// PUT /api/nodes/{id} — fields missing from the body keep their stored value.
func (h *Handler) UpdateNode(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	node, ok := h.nodes.Get(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "node not found"})
		return
	}
	if err := json.NewDecoder(r.Body).Decode(&node); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	node.ID = id
	if !validTier(node.Tier) {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "tier must be 'high-end' or 'low-end'"})
		return
	}
	if err := h.nodes.Update(node); err != nil {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "node not found"})
		return
	}
	logger.Info("node updated: " + node.Name)
	writeJSON(w, http.StatusOK, node)
}

func validTier(t config.Tier) bool {
	return t == config.TierHighEnd || t == config.TierLowEnd
}

// DELETE /api/nodes/{id}
func (h *Handler) DeleteNode(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.nodes.Delete(id); err != nil {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "node not found"})
		return
	}
	logger.Info("node deleted: " + id)
	writeJSON(w, http.StatusOK, map[string]string{"deleted": id})
}

// POST /api/nodes/{id}/wake
func (h *Handler) WakeNode(w http.ResponseWriter, r *http.Request) {
	node, ok := h.nodes.Get(r.PathValue("id"))
	if !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "node not found"})
		return
	}
	if node.MAC == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node has no MAC address configured"})
		return
	}
	if err := wol.Wake(node.MAC); err != nil {
		logger.Error("WoL failed for " + node.Name + ": " + err.Error())
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: "wake failed: " + err.Error()})
		return
	}
	logger.Info("WoL sent to " + node.Name + " (" + node.MAC + ")")
	writeJSON(w, http.StatusOK, map[string]string{"status": "sent", "node": node.Name, "mac": node.MAC})
}

// POST /api/nodes/{id}/shutdown — queues a shutdown for the node's agent,
// which picks it up on its next heartbeat.
func (h *Handler) ShutdownNode(w http.ResponseWriter, r *http.Request) {
	node, ok := h.nodes.Get(r.PathValue("id"))
	if !ok {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "node not found"})
		return
	}
	if !h.ns.IsOnline(node.ID) {
		writeJSON(w, http.StatusConflict, errorResp{Error: "node agent is offline"})
		return
	}
	h.ns.Enqueue(node.ID, "shutdown")
	logger.Info("shutdown queued for " + node.Name)
	writeJSON(w, http.StatusOK, map[string]string{"status": "queued", "node": node.Name})
}

// GET /api/nodes/{id}/models
func (h *Handler) ListNodeModels(w http.ResponseWriter, r *http.Request) {
	models, err := h.ai.ListNodeModels(r.Context(), r.PathValue("id"))
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"models": models})
}

// GET /api/nodes/{id}/models/status — every model on the node and whether it
// is currently loaded.
func (h *Handler) NodeModelsStatus(w http.ResponseWriter, r *http.Request) {
	models, err := h.ai.ListAllNodeModels(r.Context(), r.PathValue("id"))
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"models": models})
}

type modelReq struct {
	Model string `json:"model"`
}

// POST /api/nodes/{id}/models/load
func (h *Handler) LoadNodeModel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req modelReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Model == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "model name required"})
		return
	}
	if err := h.ai.LoadNodeModel(r.Context(), id, req.Model); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: err.Error()})
		return
	}
	logger.Info("model loaded on node " + id + ": " + req.Model)
	writeJSON(w, http.StatusOK, map[string]string{"status": "loaded", "model": req.Model})
}

// POST /api/nodes/{id}/models/unload
func (h *Handler) UnloadNodeModel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req modelReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Model == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "model name required"})
		return
	}
	if err := h.ai.UnloadNodeModel(r.Context(), id, req.Model); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: err.Error()})
		return
	}
	logger.Info("model unloaded from node " + id + ": " + req.Model)
	writeJSON(w, http.StatusOK, map[string]string{"status": "unloaded", "model": req.Model})
}

// GET /api/config
func (h *Handler) GetConfig(w http.ResponseWriter, r *http.Request) {
	homekitPin := h.cfg.HomeKitPIN
	if len(homekitPin) > 4 {
		homekitPin = homekitPin[:3] + "···" + homekitPin[len(homekitPin)-2:]
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"router_model":   h.ai.ClassifierModel(),
		"ollama_host":    h.cfg.OllamaHost,
		"version":        h.version,
		"started_at":     h.started.Format(time.RFC3339),
		"uptime_seconds": int(time.Since(h.started).Seconds()),
		"data_dir":       h.cfg.DataDir,
		"log_dir":        h.cfg.LogDir,
		"port":           h.cfg.Port,
		"homekit_pin":    homekitPin,
		"nodes_count":    len(h.nodes.All()),
	})
}

// PUT /api/config — changes the classifier model (persisted in settings).
func (h *Handler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RouterModel string `json:"router_model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if req.RouterModel != "" {
		if err := h.settings.Update(assistant.Settings{RouterModel: req.RouterModel}); err != nil {
			writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
			return
		}
		logger.Info("router model changed to: " + req.RouterModel)
	}
	writeJSON(w, http.StatusOK, map[string]string{"router_model": h.ai.ClassifierModel()})
}

// GET /api/settings — return user-editable runtime settings
func (h *Handler) GetSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.settings.Get())
}

// PUT /api/settings — update settings (partial)
func (h *Handler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req assistant.Settings
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if err := h.settings.Update(req); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, h.settings.Get())
}

// POST /api/settings/reset — reset settings to defaults
func (h *Handler) ResetSettings(w http.ResponseWriter, r *http.Request) {
	if err := h.settings.Reset(); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, h.settings.Get())
}

// POST /api/agent/heartbeat — unauthenticated by design (LAN agents).
func (h *Handler) AgentHeartbeat(w http.ResponseWriter, r *http.Request) {
	var stats nodestate.Stats
	if err := json.NewDecoder(r.Body).Decode(&stats); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if stats.NodeID == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node_id required"})
		return
	}
	// Map the agent to its configured node by source IP so queued commands
	// (shutdown) reach the right machine.
	if ip, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		if node, ok := h.nodes.ByHost(ip); ok {
			stats.NodeID = node.ID
		}
	}
	h.nodeHist.Record(stats, time.Now())
	writeJSON(w, http.StatusOK, map[string]any{"commands": h.ns.Update(stats)})
}

// GET /api/nodes/{id}/history?range=24h|168h — one sample per minute since
// now-range. Defaults to 24h, capped at the retention.
func (h *Handler) NodeHistory(w http.ResponseWriter, r *http.Request) {
	rangeStr := r.URL.Query().Get("range")
	if rangeStr == "" {
		rangeStr = "24h"
	}
	dur, err := time.ParseDuration(rangeStr)
	if err != nil || dur <= 0 {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid range"})
		return
	}
	since := time.Now().Add(-min(dur, nodestate.Retention))
	writeJSON(w, http.StatusOK, map[string]any{
		"samples": h.nodeHist.Series(r.PathValue("id"), since),
	})
}

// GET /api/nodes/{id}/logs — the node's latest warnings and errors, oldest first.
func (h *Handler) NodeLogs(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"lines": h.ns.Logs(r.PathValue("id"))})
}

// GET /api/nodes/stats
func (h *Handler) NodeStats(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.ns.All())
}
