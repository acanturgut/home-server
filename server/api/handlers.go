package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/acanturgut/home-server/ai"
	"github.com/acanturgut/home-server/apitokens"
	"github.com/acanturgut/home-server/assistant"
	"github.com/acanturgut/home-server/asusrouter"
	"github.com/acanturgut/home-server/auth"
	"github.com/acanturgut/home-server/config"
	"github.com/acanturgut/home-server/homedevices"
	"github.com/acanturgut/home-server/homedns"
	"github.com/acanturgut/home-server/homekit"
	"github.com/acanturgut/home-server/logger"
	"github.com/acanturgut/home-server/nodestate"
	"github.com/acanturgut/home-server/wol"
	"github.com/google/uuid"
)

type Handler struct {
	router    *ai.Router
	cfg       *config.Config
	nodes     *config.NodeStore
	ns        *nodestate.Store
	sysHist   *sysHistory
	settings  *assistant.SettingsStore
	chats     *assistant.ChatStore
	snippets  *assistant.SnippetStore
	schedules *assistant.ScheduleStore
	homedev   *homedevices.Manager
	router4   *asusrouter.Manager
	dns       *homedns.Server
	auth      *auth.Store
	tokens    *apitokens.Store
	version   string
	started   time.Time
}

func NewHandler(router *ai.Router, cfg *config.Config, nodes *config.NodeStore, ns *nodestate.Store, settings *assistant.SettingsStore, version string) *Handler {
	h := &Handler{
		router:    router,
		cfg:       cfg,
		nodes:     nodes,
		ns:        ns,
		settings:  settings,
		chats:     assistant.NewChatStore(cfg.DataDir),
		snippets:  assistant.NewSnippetStore(cfg.DataDir),
		schedules: assistant.NewScheduleStore(cfg.DataDir),
		version:   version,
		started:   time.Now(),
	}
	h.startScheduler()
	return h
}

type chatReq struct {
	Messages    []ai.Message `json:"messages"`
	Route       string       `json:"route,omitempty"` // ""|"auto"|"light"|"heavy"|<node-name>
	Temperature *float64     `json:"temperature,omitempty"`
}

type errorResp struct {
	Error string `json:"error"`
}

// POST /api/chat
func (h *Handler) Chat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, errorResp{Error: "method not allowed"})
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

	requestID := uuid.New().String()
	resp, err := h.router.Chat(r.Context(), requestID, req.Messages)
	if err != nil {
		logger.Error("chat error: " + err.Error())
		writeJSON(w, http.StatusInternalServerError, errorResp{Error: "ai request failed"})
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

// GET /api/homekit
func (h *Handler) HomeKit(w http.ResponseWriter, r *http.Request) {
	nodes := h.nodes.All()
	var accessories []map[string]any
	for _, n := range nodes {
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
	pin := h.cfg.HomeKitPIN
	displayPin := pin
	if len(pin) == 8 {
		displayPin = pin[:3] + "-" + pin[3:5] + "-" + pin[5:]
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"bridge":      "Home Server",
		"pin":         displayPin,
		"port":        51826,
		"setup_uri":   homekit.SetupURI(h.cfg.HomeKitPIN),
		"accessories": accessories,
	})
}

// GET /api/health
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	status := h.router.Status(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{
		"status":   "ok",
		"backends": status,
	})
}

// GET /api/logs?n=50
func (h *Handler) Logs(w http.ResponseWriter, r *http.Request) {
	n := 50
	if q := r.URL.Query().Get("n"); q != "" {
		if parsed, err := strconv.Atoi(q); err == nil && parsed > 0 && parsed <= 1000 {
			n = parsed
		}
	}
	entries := logger.Recent(n)
	writeJSON(w, http.StatusOK, entries)
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
	if node.Tier != config.TierHighEnd && node.Tier != config.TierLowEnd {
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

// PUT /api/nodes/{id}
func (h *Handler) UpdateNode(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node id required"})
		return
	}
	var node config.Node
	if err := json.NewDecoder(r.Body).Decode(&node); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	node.ID = id
	if node.Tier != "" && node.Tier != config.TierHighEnd && node.Tier != config.TierLowEnd {
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

// DELETE /api/nodes/{id}
func (h *Handler) DeleteNode(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node id required"})
		return
	}
	if err := h.nodes.Delete(id); err != nil {
		writeJSON(w, http.StatusNotFound, errorResp{Error: "node not found"})
		return
	}
	logger.Info("node deleted: " + id)
	writeJSON(w, http.StatusOK, map[string]string{"deleted": id})
}

// POST /api/nodes/{id}/wake
func (h *Handler) WakeNode(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node id required"})
		return
	}
	node, ok := h.nodes.Get(id)
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
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	requestID := uuid.New().String()

	opts := ai.ChatStreamOpts{Route: req.Route, Temperature: req.Temperature}
	h.router.ChatStream(r.Context(), requestID, req.Messages, opts, func(event ai.StreamEvent) {
		json.NewEncoder(w).Encode(event)
		flusher.Flush()
	})
}

// GET /api/nodes/{id}/models
func (h *Handler) ListNodeModels(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node id required"})
		return
	}
	models, err := h.router.ListNodeModels(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"models": models})
}

// GET /api/nodes/{id}/models/status — returns every model on the node along
// with whether it is currently loaded. Used by the dashboard to show a model
// picker + Load button per node.
func (h *Handler) NodeModelsStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node id required"})
		return
	}
	models, err := h.router.ListAllNodeModels(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"models": models})
}

// POST /api/nodes/{id}/models/load
func (h *Handler) LoadNodeModel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node id required"})
		return
	}
	var req struct {
		Model string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Model == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "model name required"})
		return
	}
	if err := h.router.LoadNodeModel(r.Context(), id, req.Model); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorResp{Error: err.Error()})
		return
	}
	logger.Info("model loaded on node " + id + ": " + req.Model)
	writeJSON(w, http.StatusOK, map[string]string{"status": "loaded", "model": req.Model})
}

// POST /api/nodes/{id}/models/unload
func (h *Handler) UnloadNodeModel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "node id required"})
		return
	}
	var req struct {
		Model string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Model == "" {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "model name required"})
		return
	}
	if err := h.router.UnloadNodeModel(r.Context(), id, req.Model); err != nil {
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
		"router_model":   h.cfg.RouterModel,
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

// PUT /api/config
func (h *Handler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RouterModel string `json:"router_model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResp{Error: "invalid json"})
		return
	}
	if req.RouterModel != "" {
		h.cfg.RouterModel = req.RouterModel
		logger.Info("router model changed to: " + req.RouterModel)
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"router_model": h.cfg.RouterModel,
	})
}

// GET /api/settings — return user-editable runtime settings
func (h *Handler) GetSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.settings.Get())
}

// PUT /api/settings — update settings (partial)
func (h *Handler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req assistant.Settings
	if err := json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&req); err != nil {
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

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

// POST /api/agent/heartbeat
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

	// Try to match the agent's source IP to a configured node.
	// This ensures commands (shutdown etc.) route correctly.
	remoteIP := r.RemoteAddr
	if idx := strings.LastIndex(remoteIP, ":"); idx != -1 {
		remoteIP = remoteIP[:idx]
	}
	remoteIP = strings.Trim(remoteIP, "[]") // strip IPv6 brackets

	if node, ok := h.nodes.ByHost(remoteIP); ok {
		stats.NodeID = node.ID // use config node ID
	}

	cmds := h.ns.Update(stats)
	writeJSON(w, http.StatusOK, map[string]any{
		"commands": cmds,
	})
}

// GET /api/nodes/stats
func (h *Handler) NodeStats(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.ns.All())
}
